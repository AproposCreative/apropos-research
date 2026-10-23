import MailComposer from 'nodemailer/lib/mail-composer';
import type { MailboxId } from '@/lib/accreditation/imap/config';
import { archiveExactMessage, mimeHash } from './imap';

type RawMail = ConstructorParameters<typeof MailComposer>[0];
type SmtpResult = { accepted?: Array<string>; rejected?: Array<string> };

/** The one SMTP/IMAP boundary for One.com mail. SMTP is invoked once, never by archive repair. */
export async function submitAndArchiveOneCom(input: {
  mailbox: MailboxId;
  messageId: string;
  message: RawMail;
  envelope: { from: string; to: string[] };
  submit: (raw: Buffer, envelope: { from: string; to: string[] }) => Promise<SmtpResult>;
  onPrepared?: (raw: Buffer, sha256: string) => Promise<void>;
  onAccepted?: (receipt: { messageId: string; acceptedAt: string; mimeSha256: string }) => Promise<void>;
}) {
  const raw = await new MailComposer({ ...input.message, messageId: input.messageId }).compile().build();
  const mimeSha256 = mimeHash(raw);
  await input.onPrepared?.(raw, mimeSha256);
  const result = await input.submit(raw, input.envelope);
  const accepted = new Set((result.accepted || []).map(address => address.toLowerCase()));
  if (result.rejected?.length || !input.envelope.to.every(address => accepted.has(address.toLowerCase())))
    throw Error('mcp_mail_smtp_result_unconfirmed');
  const acceptedAt = new Date().toISOString();
  await input.onAccepted?.({ messageId: input.messageId, acceptedAt, mimeSha256 });
  // An IMAP error is a separate result. Never run SMTP again to repair it.
  const sentFolderSync = await archiveExactMessage(input.mailbox, raw, input.messageId, acceptedAt);
  return { messageId: input.messageId, acceptedAt, mimeSha256,
    sentFolderSync, sentCopyArchived: sentFolderSync.status === 'verified' };
}
