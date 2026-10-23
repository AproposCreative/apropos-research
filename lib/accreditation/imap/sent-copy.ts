import type { ListResponse } from 'imapflow';
import { createImapClient } from '@/lib/accreditation/imap/client';
import { getMailboxSecrets, sanitizeImapError } from '@/lib/accreditation/imap/config';

export type SentCopyResult = {
  ok: boolean;
  mailboxPath?: string;
  error?: string;
};

/** Resolve the server's real Sent folder, including Danish and English names. */
export function findSentMailboxPath(
  mailboxes: Array<Pick<ListResponse, 'path' | 'name' | 'specialUse'>>
): string | undefined {
  const special = mailboxes.find(
    (mailbox) => mailbox.specialUse?.toLowerCase() === '\\sent'
  );
  if (special) return special.path;

  const named = mailboxes.find((mailbox) =>
    /^(sent|sent mail|sent messages|sendt|sendte|sendte mails)$/i.test(
      mailbox.name.trim()
    )
  );
  return named?.path;
}

/**
 * Append a copy of a successfully sent SMTP message to one.com's IMAP Sent
 * folder so Apple Mail and other clients show the complete Liv history.
 */
export async function appendLivSentCopy(rawMessage: Buffer): Promise<SentCopyResult> {
  if (process.env.ACCREDITATION_ARCHIVE_SENT === 'false') {
    return { ok: false, error: 'sent archive disabled by environment' };
  }

  let password: string | undefined;
  try {
    password = getMailboxSecrets('liv').password;
    const client = await createImapClient('liv');
    try {
      const mailboxes = await client.list();
      // The owner's Apple Mail maps Liv's Sendt to this server folder. One.com
      // also exposes a separate `Sent` folder with \Sent, which Apple does not show.
      // Do not silently fall back to that other folder if the mapping disappears.
      const sentPath = mailboxes.find((mailbox) => mailbox.path === 'Sent Messages')?.path;
      if (!sentPath) {
        return { ok: false, error: 'Liv Apple Mail Sent Messages folder was not found' };
      }
      const appended = await client.append(sentPath, rawMessage, ['\\Seen'], new Date());
      return appended
        ? { ok: true, mailboxPath: sentPath }
        : { ok: false, mailboxPath: sentPath, error: 'IMAP append returned false' };
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore logout errors */
      }
    }
  } catch (error) {
    return { ok: false, error: sanitizeImapError(error, password) };
  }
}
