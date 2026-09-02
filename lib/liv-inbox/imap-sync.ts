/**
 * Sync Liv's real inbox (one.com IMAP) into the Liv Indbakke desk.
 *
 * Reuses the existing one.com IMAP layer (createImapClient / getMailboxSecrets)
 * and MIME parser, then feeds each new message through processInboundEmail so
 * Liv triages, drafts, and escalates exactly as with the manual/simulated feed.
 *
 * Only UNSEEN messages are ingested, so activating the desk does not replay the
 * entire mailbox history. De-duplication is by RFC Message-ID.
 */
import type { ParsedInboundMail } from '@/lib/accreditation/imap/correlate';
import { getMailboxPublicConfig, sanitizeImapError } from '@/lib/accreditation/imap/config';
import { listInboxItems } from '@/lib/liv-inbox/inbox-store';
import { processInboundEmail } from '@/lib/liv-inbox/process';
import { isLivInboxSendingEnabled, livInboxMaxAutoSendPerRun } from '@/lib/liv-inbox/send';
import { toAttachmentMeta } from '@/lib/liv-inbox/attachments';
import { getLivInboxSettings } from '@/lib/liv-inbox/settings-store';
import {
  applyEditorGuidanceAndSend,
  correlateEditorReply,
  handleEditorTask,
  isFromEditor,
} from '@/lib/liv-inbox/editor';

export interface FetchedMessage {
  uid: number;
  parsed: ParsedInboundMail;
}

export interface LivInboxSyncSummary {
  ok: boolean;
  configured: boolean;
  scanned: number;
  processed: number;
  skipped: number;
  errors: string[];
}

export interface LivMailboxStatus {
  user: string;
  host: string;
  port: number;
  configured: boolean;
}

/** Public connection status for the UI (never exposes the password). */
export function getLivMailboxStatus(): LivMailboxStatus {
  const pub = getMailboxPublicConfig('liv');
  return {
    user: pub.user,
    host: pub.host,
    port: pub.port,
    configured: pub.passwordConfigured,
  };
}

/**
 * Ingest already-fetched messages: de-duplicate by Message-ID and run each new
 * one through Liv. Pure with respect to IMAP, so it is unit-testable.
 */
export async function ingestFetchedMessages(
  messages: FetchedMessage[]
): Promise<Omit<LivInboxSyncSummary, 'configured'>> {
  const existing = await listInboxItems();
  const seenIds = new Set(existing.map((i) => i.sourceMessageId).filter(Boolean) as string[]);
  const settings = await getLivInboxSettings();
  const sendingOn = isLivInboxSendingEnabled();

  let scanned = 0;
  let processed = 0;
  let skipped = 0;
  let autoSent = 0;
  const errors: string[] = [];

  // Hard per-run cap so an inbox full of unread mail can never trigger a burst.
  const sendBudget = livInboxMaxAutoSendPerRun();

  // Oldest first so the newest ends up on top of the list.
  const ordered = [...messages].sort((a, b) => a.uid - b.uid);

  for (const msg of ordered) {
    scanned++;
    const messageId = msg.parsed.messageId;
    if (messageId && seenIds.has(messageId)) {
      skipped++;
      continue;
    }

    // Staff (@aproposmagazine.com only): either a reply to Liv's question, or a
    // task for her to carry out — never a normal inbound. External From: is
    // never treated as a task, even if the display-name looks internal.
    if (msg.parsed.fromEmail && isFromEditor(msg.parsed.fromEmail, settings, msg.parsed.headers)) {
      if (!sendingOn || autoSent >= sendBudget) {
        skipped++;
        continue;
      }
      try {
        const parent = correlateEditorReply(msg.parsed, existing);
        if (parent) {
          const r = await applyEditorGuidanceAndSend(parent, msg.parsed.text || '', settings);
          if (r.sent) autoSent++;
        } else {
          await handleEditorTask(msg.parsed, settings);
          autoSent++;
        }
        if (messageId) seenIds.add(messageId);
        processed++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      continue;
    }

    const bodyText = (msg.parsed.text || '').trim();
    const attachments = toAttachmentMeta(msg.parsed.attachments);
    // Keep attachment-only mails (e.g. a bare invoice PDF) — don't drop them.
    if (!msg.parsed.fromEmail || (!bodyText && attachments.length === 0)) {
      skipped++;
      continue;
    }
    const effectiveBody = bodyText || '(ingen brødtekst - se vedhæftninger)';
    try {
      const item = await processInboundEmail(
        {
          fromEmail: msg.parsed.fromEmail,
          fromName: msg.parsed.fromName,
          subject: msg.parsed.subject || '(uden emne)',
          body: effectiveBody,
          attachments,
        },
        {
          source: 'imap',
          sourceMessageId: messageId,
          sourceUid: msg.uid,
          receivedAt: msg.parsed.date,
          allowAutoSend: autoSent < sendBudget,
          inReplyTo: msg.parsed.inReplyTo,
          references: msg.parsed.references,
          headers: msg.parsed.headers,
        }
      );
      if (item.sent) autoSent++;
      if (messageId) seenIds.add(messageId);
      processed++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return { ok: errors.length === 0, scanned, processed, skipped, errors: errors.slice(0, 10) };
}

/** Fetch newest UNSEEN messages from Liv's one.com INBOX and parse them. */
async function fetchUnseenFromLivInbox(limit: number): Promise<FetchedMessage[]> {
  const [{ createImapClient }, { getMailboxSecrets }, { parseRawMime }] = await Promise.all([
    import('@/lib/accreditation/imap/client'),
    import('@/lib/accreditation/imap/config'),
    import('@/lib/accreditation/imap/parse'),
  ]);

  const password = getMailboxSecrets('liv').password;
  const client = await createImapClient('liv');
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      const targetUids = [...uids].sort((a, b) => b - a).slice(0, limit);
      if (targetUids.length === 0) return [];

      const out: FetchedMessage[] = [];
      for await (const msg of client.fetch(
        targetUids,
        { uid: true, source: true },
        { uid: true }
      )) {
        if (typeof msg.uid !== 'number' || !msg.source) continue;
        const src = Buffer.isBuffer(msg.source) ? msg.source : Buffer.from(msg.source as Uint8Array);
        try {
          out.push({ uid: msg.uid, parsed: await parseRawMime(src) });
        } catch {
          /* skip unparseable message */
        }
      }
      return out;
    } finally {
      lock.release();
    }
  } catch (e) {
    throw new Error(sanitizeImapError(e, password));
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Pull new mail from Liv's one.com inbox and let Liv handle it.
 * Fails closed with a clear reason when the mailbox password is not configured.
 */
export async function syncLivInbox(opts?: { limit?: number }): Promise<LivInboxSyncSummary> {
  const limit = Math.min(Math.max(1, opts?.limit ?? 20), 50);
  const status = getLivMailboxStatus();
  if (!status.configured) {
    return {
      ok: false,
      configured: false,
      scanned: 0,
      processed: 0,
      skipped: 0,
      errors: ['LIV_IMAP_PASSWORD er ikke konfigureret for Livs one.com-indbakke.'],
    };
  }
  try {
    const messages = await fetchUnseenFromLivInbox(limit);
    const summary = await ingestFetchedMessages(messages);
    return { configured: true, ...summary };
  } catch (e) {
    return {
      ok: false,
      configured: true,
      scanned: 0,
      processed: 0,
      skipped: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }
}
