import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { ImapFlow } from 'imapflow';
import { getMailboxSecrets, type MailboxId } from '@/lib/accreditation/imap/config';
import { findSentMailboxPath } from '@/lib/accreditation/imap/sent-copy';
import { mailboxAddress, mailboxName } from './mailbox';

export type OutgoingReply = { mailbox: MailboxId; to: string; subject: string; body: string; messageId: string; inReplyTo: string; references: string[] };
/** Authentication/connection check only. Does not submit a message or test delivery. */
export async function verifyReplyTransport(mailbox: MailboxId) {
  const transport = nodemailer.createTransport(smtpConfig(mailbox));
  try { await transport.verify(); return { mailbox, authenticated: true, sent: false, checkedAt: new Date().toISOString() }; }
  catch { throw Error('mcp_mail_smtp_unavailable'); }
  finally { transport.close(); }
}
export function smtpConfig(mailbox: MailboxId) {
  const prefix = mailbox.toUpperCase();
  const user = process.env[`${prefix}_SMTP_USER`]?.trim() || process.env[`${prefix}_IMAP_USER`]?.trim() || mailboxAddress(mailbox);
  const pass = process.env[`${prefix}_SMTP_PASSWORD`]?.trim() || process.env[`${prefix}_IMAP_PASSWORD`]?.trim();
  if (user.toLowerCase() !== mailboxAddress(mailbox)) throw Error('mcp_mail_identity_mismatch');
  if (!pass) throw Error('mcp_mail_smtp_not_configured');
  if (process.env.EDITORIAL_MAIL_SENDING_ENABLED === 'false') throw Error('mcp_mail_sending_disabled');
  // Never silently redirect a personal reply, or remove an existing emergency stop.
  if (mailbox === 'liv' && process.env.LIV_INBOX_SENDING_ENABLED !== 'true') throw Error('mcp_mail_sending_disabled');
  if ((process.env.LIV_INBOX_TEST_REDIRECT_TO || process.env.ACCREDITATION_TEST_REDIRECT_TO || '').trim()) throw Error('mcp_mail_test_redirect_active');
  return { host: process.env.ONECOM_SMTP_HOST?.trim() || 'send.one.com', port: Number(process.env.ONECOM_SMTP_PORT || 465),
    secure: true, auth: { user, pass }, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 25000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true };
}

/** Called once only after a durable personal approval claim. No retries or provider fallback. */
export async function sendApprovedReply(reply: OutgoingReply) {
  const transport = nodemailer.createTransport(smtpConfig(reply.mailbox));
  const options = { from: { name: mailboxName(reply.mailbox), address: mailboxAddress(reply.mailbox) },
    to: reply.to, replyTo: mailboxAddress(reply.mailbox), subject: reply.subject, text: reply.body,
    messageId: reply.messageId, ...(reply.inReplyTo ? { inReplyTo: reply.inReplyTo } : {}), references: reply.references,
    disableFileAccess: true, disableUrlAccess: true };
  try {
    const info = await transport.sendMail(options);
    if (!info.accepted?.some((a: unknown) => String(a).toLowerCase() === reply.to.toLowerCase()) || info.rejected?.length) throw Error('mcp_mail_smtp_result_unconfirmed');
    // SMTP acceptance is not proof of recipient delivery. Archive failures never cause resend.
    let sentCopyArchived = false;
    try {
      const raw = await new MailComposer(options).compile().build();
      const config = getMailboxSecrets(reply.mailbox);
      const client = new ImapFlow({ host: config.host, port: config.port, secure: true, auth: { user: config.user, pass: config.password },
        logger: false, emitLogs: false, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000 });
      client.on('error', () => { /* Archive failure must never trigger another SMTP send. */ });
      try { await client.connect(); const path = findSentMailboxPath(await client.list());
        if (path) sentCopyArchived = !!await client.append(path, raw, ['\\Seen'], new Date());
      } finally { try { await client.logout(); } catch { client.close(); } }
    } catch { /* Keep accepted evidence even if the copy could not be archived. */ }
    return { status: 'accepted' as const, messageId: reply.messageId, acceptedBySmtp: true, recipientDeliveryVerified: false,
      sentCopyArchived, acceptedAt: new Date().toISOString() };
  } finally { transport.close(); }
}
