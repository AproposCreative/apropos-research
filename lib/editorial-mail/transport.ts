import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { type MailboxId } from '@/lib/accreditation/imap/config';
import { archiveExactMessage, mimeHash, type SentFolderSync } from './imap';
import { mailboxAddress, mailboxName } from './mailbox';
import { resolveLivInboxRecipient, livInboxTestRedirectTo } from '@/lib/liv-inbox/send';

export type OutgoingReply = { mailbox: MailboxId; to: string; cc?: string[]; bcc?: string[]; html?: string; subject: string; body: string; messageId: string; inReplyTo: string; references: string[] };
export type MailReceipt = { status: 'accepted'; messageId: string; acceptedBySmtp: true; recipientDeliveryVerified: false;
  sentCopyArchived: boolean; acceptedAt: string; mimeSha256: string; bcc: string[]; sentFolderSync?: SentFolderSync };
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
  // Accreditation's sink belongs to that separate system. Liv already has an
  // explicit opt-in that decouples it; reuse its effective policy, not raw env.
  // Frederik's new personal-only path never uses either legacy sender or sink.
  if (mailbox === 'liv' && livInboxTestRedirectTo()) throw Error('mcp_mail_test_redirect_active');
  if ((process.env.EDITORIAL_MAIL_TEST_REDIRECT_TO || '').trim()) throw Error('mcp_mail_test_redirect_active');
  return { host: process.env.ONECOM_SMTP_HOST?.trim() || 'send.one.com', port: Number(process.env.ONECOM_SMTP_PORT || 465),
    secure: true, auth: { user, pass }, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 25000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true };
}
export function assertReplyRecipient(mailbox: MailboxId, to: string) {
  if (mailbox === 'liv') {
    const resolved = resolveLivInboxRecipient(to);
    if (resolved.blocked || resolved.redirected || resolved.to !== to) throw Error('mcp_mail_recipient_blocked');
  }
}

/** Called once only after a durable personal approval claim. No retries or provider fallback. */
export async function sendApprovedReply(reply: OutgoingReply, onAccepted?: (receipt: MailReceipt) => Promise<void>, onPrepared?: (raw:Buffer) => Promise<void>) {
  const recipients = [...new Set([reply.to, ...(reply.cc || []), ...(reply.bcc || [])])];
  for (const recipient of recipients) assertReplyRecipient(reply.mailbox, recipient);
  const transport = nodemailer.createTransport(smtpConfig(reply.mailbox));
  const options = { from: { name: mailboxName(reply.mailbox), address: mailboxAddress(reply.mailbox) },
    to: reply.to, cc: reply.cc, replyTo: mailboxAddress(reply.mailbox), subject: reply.subject, text: reply.body, html: reply.html,
    date: new Date(), newline: 'windows' as const,
    messageId: reply.messageId, ...(reply.inReplyTo ? { inReplyTo: reply.inReplyTo } : {}), references: reply.references,
    disableFileAccess: true, disableUrlAccess: true };
  try {
    // Build ONCE: SMTP and IMAP receive identical bytes. BCC is envelope-only.
    const raw = await new MailComposer(options).compile().build();
    await onPrepared?.(raw); // Private recovery bytes, no credentials or approval token.
    const info = await transport.sendMail({ raw, envelope: { from: mailboxAddress(reply.mailbox), to: recipients }, disableFileAccess: true, disableUrlAccess: true });
    if (!recipients.every(recipient => info.accepted?.some((a: unknown) => String(a).toLowerCase() === recipient.toLowerCase())) || info.rejected?.length) throw Error('mcp_mail_smtp_result_unconfirmed');
    const receipt: MailReceipt = { status: 'accepted', messageId: reply.messageId, acceptedBySmtp: true, recipientDeliveryVerified: false,
      sentCopyArchived: false, acceptedAt: new Date().toISOString(), mimeSha256: mimeHash(raw), bcc: reply.bcc || [] };
    // Persist SMTP evidence before attempting IMAP, so an IMAP timeout cannot erase it.
    await onAccepted?.(receipt);
    const sentFolderSync = await archiveExactMessage(reply.mailbox, raw, reply.messageId);
    return { ...receipt, sentFolderSync, sentCopyArchived: sentFolderSync.status === 'verified' };
  } finally { transport.close(); }
}
