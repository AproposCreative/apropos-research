import { ImapFlow } from 'imapflow';
import {
  getMailboxSecrets,
  sanitizeImapError,
  type MailboxId,
} from '@/lib/accreditation/imap/config';

export type ImapConnectionTestResult = {
  ok: boolean;
  mailboxId: MailboxId;
  user: string;
  host: string;
  port: number;
  error?: string;
  inboxExists?: boolean;
  uidNext?: number;
  messages?: number;
};

/** Open a short-lived IMAP connection. Caller must always `await client.logout()` / close. */
export async function createImapClient(mailboxId: MailboxId): Promise<ImapFlow> {
  const secrets = getMailboxSecrets(mailboxId);
  const client = new ImapFlow({
    host: secrets.host,
    port: secrets.port,
    secure: true,
    auth: {
      user: secrets.user,
      pass: secrets.password,
    },
    logger: false,
    emitLogs: false,
  });
  try {
    await client.connect();
    return client;
  } catch (e) {
    throw new Error(sanitizeImapError(e, secrets.password));
  }
}

export async function testImapConnection(mailboxId: MailboxId): Promise<ImapConnectionTestResult> {
  let password: string | undefined;
  try {
    const secrets = getMailboxSecrets(mailboxId);
    password = secrets.password;
    const client = await createImapClient(mailboxId);
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const status = await client.status('INBOX', { messages: true, uidNext: true });
        return {
          ok: true,
          mailboxId,
          user: secrets.user,
          host: secrets.host,
          port: secrets.port,
          inboxExists: true,
          uidNext: status.uidNext,
          messages: status.messages,
        };
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
    const { getMailboxPublicConfig } = await import('@/lib/accreditation/imap/config');
    const pub = getMailboxPublicConfig(mailboxId);
    return {
      ok: false,
      mailboxId,
      user: pub.user,
      host: pub.host,
      port: pub.port,
      error: sanitizeImapError(e, password),
    };
  }
}
