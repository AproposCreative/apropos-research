import { createImapClient } from '@/lib/accreditation/imap/client';
import {
  correlateInboundToThread,
  type ParsedInboundMail,
} from '@/lib/accreditation/imap/correlate';
import {
  getCursor,
  markProcessedMessageId,
  markProcessedUid,
  setCursor,
} from '@/lib/accreditation/imap/cursor-store';
import { parseRawMime } from '@/lib/accreditation/imap/parse';
import { sanitizeImapError, type MailboxId } from '@/lib/accreditation/imap/config';
import { appendAudit } from '@/lib/accreditation/audit-store';
import {
  classifyAndExtractIntake,
  isAddressedToLiv,
  isTrustedAccreditationRequester,
} from '@/lib/accreditation/inbound-intake';
import {
  autoReplyToExternal,
  processInternalIntake,
} from '@/lib/accreditation/orchestrator';
import {
  appendInboundMessage,
} from '@/lib/accreditation/email-thread-store';
import { updateMemoryAfterEvent } from '@/lib/accreditation/memory-store';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';
import { summarizeAccreditationInbound } from '@/lib/accreditation/summarize-inbound';

export type PollResult = {
  mailboxId: MailboxId;
  scanned: number;
  processed: number;
  skipped: number;
  errors: string[];
  cursorUid: number;
};

const MAX_INBOUND_AGE_MS = 24 * 60 * 60 * 1000;

/** Defense in depth if an IMAP cursor is ever lost or reset. */
export function isHistoricalInbound(
  mail: Pick<ParsedInboundMail, 'date'>,
  nowMs = Date.now()
): boolean {
  if (!mail.date) return false;
  const receivedMs = Date.parse(mail.date);
  if (!Number.isFinite(receivedMs)) return false;
  return receivedMs < nowMs - MAX_INBOUND_AGE_MS;
}

async function processParsedMail(
  mailboxId: MailboxId,
  mail: ParsedInboundMail,
  uid: number
): Promise<'processed' | 'skipped'> {
  if (isHistoricalInbound(mail)) {
    if (mail.messageId) await markProcessedMessageId(mail.messageId);
    await markProcessedUid(mailboxId, uid);
    await appendAudit({
      type: 'imap_historical_skipped',
      detail: `Historical IMAP message skipped from ${mail.fromEmail}`,
      meta: { mailboxId, uid, receivedAt: mail.date || null },
    });
    return 'skipped';
  }

  if (mail.messageId) {
    const { firstTime } = await markProcessedMessageId(mail.messageId);
    if (!firstTime) {
      await markProcessedUid(mailboxId, uid);
      return 'skipped';
    }
  }
  {
    const { firstTime } = await markProcessedUid(mailboxId, uid);
    if (!firstTime) return 'skipped';
  }

  const thread = await correlateInboundToThread(mail);

  if (thread) {
    const { aiSummary, suggestedReply, novelQuestion } = await summarizeAccreditationInbound({
      subject: mail.subject,
      from: mail.fromEmail,
      text: mail.text,
      thread,
    });

    await appendInboundMessage(
      thread.id,
      {
        from: mail.fromEmail,
        to: mail.toAddresses[0] || '',
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        receivedAt: mail.date || new Date().toISOString(),
        resendEmailId: mail.messageId,
        untrusted: true,
        messageId: mail.messageId,
      },
      { aiSummary, suggestedReply, novelQuestion }
    );

    await updateMemoryAfterEvent({
      requestId: thread.requestId,
      threadId: thread.id,
      contactEmail: mail.fromEmail,
      contactName: mail.fromName,
      direction: 'inbound',
      blurb: (aiSummary || mail.subject || 'inbound').slice(0, 200),
      subject: mail.subject,
      sourceMailbox: mailboxId === 'liv' ? 'liv@aproposmagazine.com' : 'frederik@aproposmagazine.com',
    });

    const request = await getRequestById(thread.requestId);
    if (request) {
      await updateRequest(request.id, { status: 'replied' });
      await autoReplyToExternal({
        request,
        threadId: thread.id,
        to: mail.fromEmail,
        subject: mail.subject.startsWith('Re:') ? mail.subject : `Re: ${thread.subject}`,
        suggestedReply,
        novelQuestion,
        inboundText: mail.text,
        attachments: mail.attachments?.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          buffer: a.content,
        })),
      });
    }

    await appendAudit({
      requestId: thread.requestId,
      type: 'imap_inbound',
      detail: `IMAP reply from ${mail.fromEmail}`,
      meta: { mailboxId, uid, threadId: thread.id },
    });

    return 'processed';
  }

  // Liv or Frederik inbox: possible request from an approved internal writer.
  const isIntakeMailbox =
    mailboxId === 'frederik' ||
    (mailboxId === 'liv' &&
      isAddressedToLiv(
        mail.toAddresses.length ? mail.toAddresses : ['liv@aproposmagazine.com']
      ));
  if (isIntakeMailbox) {
    if (!(await isTrustedAccreditationRequester(mail.fromEmail))) {
      await appendAudit({
        type: 'imap_untrusted_requester_ignored',
        detail: `Untrusted accreditation requester ignored from ${mail.fromEmail}`,
        meta: { mailboxId, uid, subject: mail.subject.slice(0, 200) },
      });
      return 'processed';
    }

    const classification = await classifyAndExtractIntake({
      subject: mail.subject,
      fromEmail: mail.fromEmail,
      fromName: mail.fromName,
      text: mail.text,
    });

    if (classification.isInternalAccreditationRequest && classification.concerts.length) {
      await processInternalIntake({
        concerts: classification.concerts,
        fromEmail: mail.fromEmail,
        fromName: mail.fromName,
        subject: mail.subject,
        sourceEmailId: mail.messageId,
        forceEscalate: classification.ambiguous || classification.escalateFlags.length > 0,
        extraFlags: classification.escalateFlags,
      });
      await appendAudit({
        type: 'imap_intake',
        detail: `IMAP intake from ${mail.fromEmail}`,
        meta: {
          mailboxId,
          uid,
          concerts: classification.concerts.length,
          defaultTicketQuantity: 1,
        },
      });
      return 'processed';
    }

    await appendAudit({
      type: 'imap_internal_non_accreditation_ignored',
      detail: `Internal non-accreditation mail ignored from ${mail.fromEmail}`,
      meta: { mailboxId, uid, reason: classification.reason },
    });
    return 'processed';
  }

  return 'skipped';
}

/** Poll INBOX for UIDs after cursor; process newest messages for Liv (production ingestion). */
export async function pollMailbox(
  mailboxId: MailboxId,
  opts?: { limit?: number }
): Promise<PollResult> {
  const limit = opts?.limit ?? 40;
  const errors: string[] = [];
  let scanned = 0;
  let processed = 0;
  let skipped = 0;
  const cursor = await getCursor(mailboxId);
  let maxUid = cursor.lastUid;

  // Always ingest when automation is OFF — only outbound is gated in orchestrator.

  let password: string | undefined;
  try {
    const { getMailboxSecrets } = await import('@/lib/accreditation/imap/config');
    password = getMailboxSecrets(mailboxId).password;
    const client = await createImapClient(mailboxId);
    try {
      // A missing cursor means this mailbox has never been activated. Establish
      // a baseline at the current end of the inbox and do not replay history.
      if (cursor.lastUid <= 0) {
        const status = await client.status('INBOX', { messages: true, uidNext: true });
        const baselineUid = Math.max(0, Number(status.uidNext || 1) - 1);
        await setCursor(mailboxId, baselineUid);
        await appendAudit({
          type: 'imap_cursor_initialized',
          detail: `IMAP cursor initialized for ${mailboxId}; existing history not processed`,
          meta: {
            mailboxId,
            baselineUid,
            existingMessages: Number(status.messages || 0),
          },
        });
        return {
          mailboxId,
          scanned: 0,
          processed: 0,
          skipped: 0,
          errors: [],
          cursorUid: baselineUid,
        };
      }

      const lock = await client.getMailboxLock('INBOX');
      try {
        const range = cursor.lastUid > 0 ? `${cursor.lastUid + 1}:*` : '1:*';
        const collected: { uid: number; source: Buffer }[] = [];
        for await (const msg of client.fetch(
          range,
          { uid: true, source: true },
          { uid: true }
        )) {
          if (typeof msg.uid === 'number' && msg.source) {
            const src = Buffer.isBuffer(msg.source)
              ? msg.source
              : Buffer.from(msg.source as Uint8Array);
            collected.push({ uid: msg.uid, source: src });
          }
        }
        const slice = collected
          .filter((m) => m.uid > cursor.lastUid)
          .sort((a, b) => a.uid - b.uid)
          .slice(-limit);

        for (const item of slice) {
          scanned++;
          try {
            const mail = await parseRawMime(item.source);
            const result = await processParsedMail(mailboxId, mail, item.uid);
            if (result === 'processed') processed++;
            else skipped++;
            if (item.uid > maxUid) maxUid = item.uid;
          } catch (e) {
            errors.push(sanitizeImapError(e, password));
            if (item.uid > maxUid) maxUid = item.uid;
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    errors.push(sanitizeImapError(e, password));
  }

  if (maxUid > cursor.lastUid) await setCursor(mailboxId, maxUid);

  return {
    mailboxId,
    scanned,
    processed,
    skipped,
    errors: errors.slice(0, 10),
    cursorUid: maxUid,
  };
}
