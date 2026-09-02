/**
 * Sync Liv's real inbox (one.com IMAP) into the Liv Indbakke desk.
 *
 * Reuses the existing one.com IMAP layer (createImapClient / getMailboxSecrets)
 * and MIME parser, then feeds each new message through processInboundEmail so
 * Liv triages, drafts, and escalates exactly as with the manual/simulated feed.
 *
 * Newest messages are ingested by UID (seen or unseen). Accreditation's poll
 * of the same mailbox can mark mail \\Seen, so an UNSEEN-only search would
 * silently drop intern/staff mail. De-duplication is by RFC Message-ID + UID.
 */
import type { ParsedInboundMail } from '@/lib/accreditation/imap/correlate';
import { getMailboxPublicConfig, sanitizeImapError } from '@/lib/accreditation/imap/config';
import { createInboxItem, listInboxItems, updateInboxItem } from '@/lib/liv-inbox/inbox-store';
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
import type { LivInboxItem } from '@/lib/liv-inbox/types';

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
 * Always persist a card in the desk — even intern tasks and rejected mail —
 * so nothing Liv's mailbox received can vanish without a trace.
 */
async function persistVisibleInbound(
  msg: FetchedMessage,
  patch: Partial<Omit<LivInboxItem, 'id'>>
): Promise<LivInboxItem> {
  const attachments = toAttachmentMeta(msg.parsed.attachments);
  return createInboxItem({
    fromEmail: (msg.parsed.fromEmail || '').trim().toLowerCase() || '(ukendt)',
    fromName: msg.parsed.fromName,
    subject: msg.parsed.subject || '(uden emne)',
    body: (msg.parsed.text || '').trim() || '(ingen brødtekst)',
    receivedAt: msg.parsed.date || new Date().toISOString(),
    status: 'draft',
    source: 'imap',
    sourceMessageId: msg.parsed.messageId,
    sourceUid: msg.uid,
    attachments: attachments.length ? attachments : undefined,
    ...patch,
  });
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
  const seenUids = new Set(
    existing.map((i) => i.sourceUid).filter((u): u is number => typeof u === 'number')
  );
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

  const markSeen = (msg: FetchedMessage) => {
    if (msg.parsed.messageId) seenIds.add(msg.parsed.messageId);
    seenUids.add(msg.uid);
  };

  for (const msg of ordered) {
    scanned++;
    const messageId = msg.parsed.messageId;
    if ((messageId && seenIds.has(messageId)) || seenUids.has(msg.uid)) {
      skipped++;
      continue;
    }

    // Staff (@aproposmagazine.com only): either a reply to Liv's question, or a
    // task for her to carry out — never a normal inbound. Always persisted so
    // the desk never swallows intern mail silently.
    if (msg.parsed.fromEmail && isFromEditor(msg.parsed.fromEmail, settings, msg.parsed.headers)) {
      try {
        const parent = correlateEditorReply(msg.parsed, existing);
        if (parent) {
          if (autoSent < sendBudget) {
            const r = await applyEditorGuidanceAndSend(parent, msg.parsed.text || '', settings);
            if (r.sent) autoSent++;
          }
        } else {
          const recorded = await persistVisibleInbound(msg, {
            category: 'opgave',
            status: sendingOn ? 'draft' : 'escalated',
            needsHuman: true,
            reasoning: sendingOn
              ? 'Intern opgave fra redaktionen.'
              : 'Opgave modtaget. Afsendelse er slået fra, så Liv har ikke sendt videre endnu.',
          });
          if (sendingOn && autoSent < sendBudget) {
            const r = await handleEditorTask(msg.parsed, settings);
            await updateInboxItem(recorded.id, {
              reasoning: r.detail,
              status: r.handled ? 'auto_replied' : 'escalated',
              needsHuman: !r.handled,
            });
            autoSent++;
          }
        }
        markSeen(msg);
        processed++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      continue;
    }

    const bodyText = (msg.parsed.text || '').trim();
    const attachments = toAttachmentMeta(msg.parsed.attachments);
    if (!msg.parsed.fromEmail || (!bodyText && attachments.length === 0)) {
      await persistVisibleInbound(msg, {
        status: 'dismissed',
        needsHuman: false,
        reasoning: !msg.parsed.fromEmail
          ? 'Afvist: ingen afsender.'
          : 'Afvist: tom mail uden vedhæftninger.',
      });
      markSeen(msg);
      processed++;
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
      markSeen(msg);
      processed++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return { ok: errors.length === 0, scanned, processed, skipped, errors: errors.slice(0, 10) };
}

/** Fetch newest messages by UID (seen or unseen) from Liv's one.com INBOX. */
async function fetchRecentFromLivInbox(limit: number): Promise<FetchedMessage[]> {
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
      const mailbox = client.mailbox;
      if (!mailbox || !mailbox.exists) return [];
      const uidNext = Number(mailbox.uidNext || 1);
      if (!Number.isFinite(uidNext) || uidNext <= 1) return [];
      const fromUid = Math.max(1, uidNext - Math.max(limit * 3, 80));
      const out: FetchedMessage[] = [];
      for await (const msg of client.fetch(`${fromUid}:*`, { uid: true, source: true }, { uid: true })) {
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
    const messages = await fetchRecentFromLivInbox(limit);
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
