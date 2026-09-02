/**
 * Sync Liv's real inbox (one.com IMAP) into the Liv Indbakke desk.
 *
 * Reuses the existing one.com IMAP layer (createImapClient / getMailboxSecrets)
 * and MIME parser, then feeds each new message through processInboundEmail so
 * Liv triages, drafts, and escalates exactly as with the manual/simulated feed.
 *
 * New messages are ingested by UID after a dedicated desk cursor (seen or
 * unseen). Accreditation's poll of the same mailbox can mark mail \\Seen, so
 * an UNSEEN-only search would silently drop intern/staff mail. Existing inbox
 * history is never replayed: the first poll baselines at uidNext-1.
 * De-duplication is by RFC Message-ID + UID.
 */
import type { ParsedInboundMail } from '@/lib/accreditation/imap/correlate';
import { getMailboxPublicConfig, sanitizeImapError } from '@/lib/accreditation/imap/config';
import { createInboxItem, listInboxItems, updateInboxItem } from '@/lib/liv-inbox/inbox-store';
import { processInboundEmail } from '@/lib/liv-inbox/process';
import { isLivInboxSendingEnabled, livInboxMaxAutoSendPerRun } from '@/lib/liv-inbox/send';
import { toAttachmentMeta } from '@/lib/liv-inbox/attachments';
import { getLivInboxImapCursor, setLivInboxImapCursor } from '@/lib/liv-inbox/imap-cursor';
import { isHistoricalLivInbound, resolveLivInboxFetchPlan } from '@/lib/liv-inbox/inbound-age';
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
  /** Set when this run established or repaired the UID cursor and processed nothing old. */
  baselined?: boolean;
  cursorUid?: number;
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

    // Cursor + de-dupe are the primary new-mail gates. Age is defense in depth
    // if a cursor is ever lost: persist the card, never auto-send or task-send.
    if (isHistoricalLivInbound(msg.parsed)) {
      await persistVisibleInbound(msg, {
        status: 'dismissed',
        needsHuman: false,
        reasoning: 'Historisk mail — Liv svarer kun på nye henvendelser.',
      });
      markSeen(msg);
      processed++;
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

/**
 * Pull new mail from Liv's one.com inbox and let Liv handle it.
 * Fails closed with a clear reason when the mailbox password is not configured.
 * First run (and large UID-gap repair) baselines at the current end of the inbox
 * and does not replay history.
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

  const [{ createImapClient }, { getMailboxSecrets }, { parseRawMime }] = await Promise.all([
    import('@/lib/accreditation/imap/client'),
    import('@/lib/accreditation/imap/config'),
    import('@/lib/accreditation/imap/parse'),
  ]);
  const password = getMailboxSecrets('liv').password;

  try {
    const cursor = await getLivInboxImapCursor();
    const client = await createImapClient('liv');
    try {
      const imapStatus = await client.status('INBOX', { messages: true, uidNext: true });
      const uidNext = Math.max(1, Number(imapStatus.uidNext || 1));
      const plan = resolveLivInboxFetchPlan(cursor.lastUid, uidNext);

      if (plan.kind === 'baseline' || plan.kind === 'rebaseline') {
        await setLivInboxImapCursor(plan.baselineUid);
        return {
          ok: true,
          configured: true,
          scanned: 0,
          processed: 0,
          skipped: 0,
          errors: [],
          baselined: true,
          cursorUid: plan.baselineUid,
        };
      }

      const lock = await client.getMailboxLock('INBOX');
      const messages: FetchedMessage[] = [];
      try {
        const start = Math.max(1, plan.fromUid);
        for await (const msg of client.fetch(`${start}:*`, { uid: true, source: true }, { uid: true })) {
          if (typeof msg.uid !== 'number' || !msg.source || msg.uid < start) continue;
          const src = Buffer.isBuffer(msg.source) ? msg.source : Buffer.from(msg.source as Uint8Array);
          try {
            messages.push({ uid: msg.uid, parsed: await parseRawMime(src) });
          } catch {
            /* skip unparseable message */
          }
        }
      } finally {
        lock.release();
      }

      const slice = messages.sort((a, b) => a.uid - b.uid).slice(0, limit);
      const summary = await ingestFetchedMessages(slice);
      const maxUid = slice.reduce((m, msg) => Math.max(m, msg.uid), cursor.lastUid);
      if (maxUid > cursor.lastUid) await setLivInboxImapCursor(maxUid);
      return { configured: true, ...summary, cursorUid: maxUid };
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    return {
      ok: false,
      configured: true,
      scanned: 0,
      processed: 0,
      skipped: 0,
      errors: [sanitizeImapError(e, password)],
    };
  }
}
