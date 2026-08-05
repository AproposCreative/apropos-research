import { createImapClient } from '@/lib/accreditation/imap/client';
import { sanitizeImapError, type MailboxId } from '@/lib/accreditation/imap/config';
import { parseRawMime } from '@/lib/accreditation/imap/parse';
import {
  readContactOverview,
  upsertDiscoveredContact,
  writeContactOverview,
  type ContactOverviewState,
} from '@/lib/accreditation/imap/contact-overview-store';
import { appendAudit } from '@/lib/accreditation/audit-store';

export type HistoryScanResult = {
  ok: boolean;
  messagesScanned: number;
  contactsFound: number;
  mailboxes: MailboxId[];
  errors: string[];
  overview: ContactOverviewState;
};

/**
 * One-time / on-demand historical scan of INBOX to build a reviewable contact overview.
 * Does not auto-write Google Sheet Contacts etc. (read-only archive).
 */
export async function scanMailboxHistory(
  mailboxIds: MailboxId[] = ['liv', 'frederik'],
  opts?: { maxPerMailbox?: number }
): Promise<HistoryScanResult> {
  const maxPerMailbox = opts?.maxPerMailbox ?? 250;
  const errors: string[] = [];
  let messagesScanned = 0;
  const overview = await readContactOverview();
  overview.contacts = overview.contacts || [];

  for (const mailboxId of mailboxIds) {
    let password: string | undefined;
    try {
      const { getMailboxSecrets } = await import('@/lib/accreditation/imap/config');
      password = getMailboxSecrets(mailboxId).password;
      const client = await createImapClient(mailboxId);
      try {
        const lock = await client.getMailboxLock('INBOX');
        try {
          const collected: { uid: number; source: Buffer }[] = [];
          for await (const msg of client.fetch(
            '1:*',
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
          const slice = collected.sort((a, b) => b.uid - a.uid).slice(0, maxPerMailbox);

          for (const item of slice) {
            try {
              const mail = await parseRawMime(item.source);
              messagesScanned++;

              if (mail.fromEmail) {
                await upsertDiscoveredContact(overview, {
                  email: mail.fromEmail,
                  name: mail.fromName,
                  subject: mail.subject,
                  seenAt: mail.date,
                  mailboxId,
                  snippet: mail.text.slice(0, 160),
                });
              }
              for (const to of mail.toAddresses) {
                await upsertDiscoveredContact(overview, {
                  email: to,
                  subject: mail.subject,
                  seenAt: mail.date,
                  mailboxId,
                });
              }
            } catch (e) {
              errors.push(sanitizeImapError(e, password));
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
      errors.push(`${mailboxId}: ${sanitizeImapError(e, password)}`);
    }
  }

  overview.lastScanAt = new Date().toISOString();
  overview.scannedMailboxes = mailboxIds;
  overview.messagesScanned = messagesScanned;
  // Prefer contacts with more messages
  overview.contacts.sort((a, b) => b.messageCount - a.messageCount);
  await writeContactOverview(overview);

  await appendAudit({
    type: 'imap_history_scan',
    detail: `Scanned ${messagesScanned} messages → ${overview.contacts.length} contacts`,
    meta: { mailboxes: mailboxIds.join(',') },
  });

  return {
    ok: errors.length === 0,
    messagesScanned,
    contactsFound: overview.contacts.length,
    mailboxes: mailboxIds,
    errors: errors.slice(0, 15),
    overview,
  };
}
