import { createHash } from 'crypto';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { Resend } from 'resend';
import { env } from '@/lib/config/env';
import { LIV_MAILBOX } from '@/lib/accreditation/types';
import { ensureRequestIdInSubject, sanitizeLivOutput } from '@/lib/accreditation/sanitize';
import {
  assertSmtpFromAllowed,
  extractEmailAddress,
  getAccreditationMailTransport,
  getMailTransportPublicStatus,
  getSmtpAuthCredentials,
  getSmtpPublicConfig,
  isForbiddenNewsFrom,
  normalizeAccreditationFrom,
  readAccreditationEnv,
  resolveSmtpFrom,
  type AccreditationMailTransport,
} from '@/lib/accreditation/mail-transport';
import { appendLivSentCopy } from '@/lib/accreditation/imap/sent-copy';

export {
  assertSmtpFromAllowed,
  extractEmailAddress,
  getAccreditationMailTransport,
  getMailTransportPublicStatus,
  getSmtpPublicConfig,
  isForbiddenNewsFrom,
  resolveSmtpFrom,
  type AccreditationMailTransport,
};

export function getAccreditationFromEmail(): string {
  const transport = getAccreditationMailTransport();
  if (transport === 'smtp') {
    return resolveSmtpFrom();
  }
  // Explicit Resend only — do not default to news.*; use root unless env overrides.
  const raw = readAccreditationEnv('ACCREDITATION_FROM_EMAIL');
  return normalizeAccreditationFrom(raw);
}

/** Plain mailbox used when plus-alias inbound domain is not configured. */
export function getAccreditationReplyToFallbackEmail(): string {
  const explicit = readAccreditationEnv('ACCREDITATION_REPLY_TO_EMAIL').toLowerCase();
  if (explicit.includes('@')) return explicit;
  const livUser = readAccreditationEnv('LIV_IMAP_USER').toLowerCase();
  if (livUser.includes('@')) return livUser;
  return LIV_MAILBOX;
}

/**
 * Reply-To for outbound Liv mail.
 * Prefer liv+{threadId}@ACCREDITATION_INBOUND_DOMAIN only when that domain is set;
 * otherwise fall back to ACCREDITATION_REPLY_TO_EMAIL → LIV_IMAP_USER → liv@aproposmagazine.com
 * so replies land on one.com IMAP (From is root liv@aproposmagazine.com via SMTP).
 */
export function getAccreditationReplyTo(threadId: string): string {
  const domain = readAccreditationEnv('ACCREDITATION_INBOUND_DOMAIN')
    .toLowerCase()
    .replace(/^@/, '');
  const safeThread = (threadId || 'thread').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (domain && safeThread) {
    return `liv+${safeThread}@${domain}`;
  }
  return getAccreditationReplyToFallbackEmail();
}

export function getAccreditationMailIdentityPublic(): {
  from: string;
  replyToMode: 'plus_alias' | 'fallback_mailbox';
  replyToExample: string;
  replyToFallback: string;
  inboundDomainConfigured: boolean;
  fromDomain: string | null;
  transport: AccreditationMailTransport;
  ok: boolean;
  label: string;
} {
  const transportStatus = getMailTransportPublicStatus();
  const from = getAccreditationFromEmail();
  const domain = readAccreditationEnv('ACCREDITATION_INBOUND_DOMAIN')
    .toLowerCase()
    .replace(/^@/, '');
  const fallback = getAccreditationReplyToFallbackEmail();
  const fromEmail = extractEmailAddress(from);
  const fromDomain = fromEmail.includes('@') ? fromEmail.split('@')[1]! : null;
  const replyToMode = domain ? ('plus_alias' as const) : ('fallback_mailbox' as const);
  const replyToExample = domain ? `liv+{threadId}@${domain}` : fallback;
  const fromOk =
    transportStatus.transport === 'smtp'
      ? fromEmail === LIV_MAILBOX && !isForbiddenNewsFrom(from)
      : Boolean(fromEmail.includes('@'));
  const replyOk = Boolean(fallback.includes('@'));
  return {
    from,
    replyToMode,
    replyToExample,
    replyToFallback: fallback,
    inboundDomainConfigured: Boolean(domain),
    fromDomain,
    transport: transportStatus.transport,
    ok: fromOk && replyOk,
    label:
      replyToMode === 'plus_alias'
        ? `${transportStatus.transport.toUpperCase()} · From + Reply-To plus-alias (${replyToExample})`
        : `${transportStatus.transport.toUpperCase()} · From + Reply-To fallback (${fallback})`,
  };
}

export type SendAccreditationEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  threadId: string;
  requestId: string;
  draftHash?: string;
  /** Base64 content attachments (both SMTP and Resend). */
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
};

export type SendAccreditationEmailResult = {
  ok: boolean;
  transport?: AccreditationMailTransport;
  resendEmailId?: string;
  messageId?: string;
  error?: string;
  subject?: string;
  replyTo?: string;
  from?: string;
  sentCopyArchived?: boolean;
  sentCopyMailbox?: string;
  sentCopyError?: string;
};

async function sendViaSmtp(
  params: SendAccreditationEmailParams & {
    from: string;
    replyTo: string;
    subject: string;
    html: string;
    text?: string;
  }
): Promise<SendAccreditationEmailResult> {
  assertSmtpFromAllowed(params.from);

  const auth = getSmtpAuthCredentials();
  if (!auth) {
    return {
      ok: false,
      transport: 'smtp',
      error:
        'SMTP auth mangler (LIV_SMTP_PASSWORD eller LIV_IMAP_PASSWORD + LIV_SMTP_USER/LIV_IMAP_USER)',
      subject: params.subject,
      replyTo: params.replyTo,
      from: params.from,
    };
  }

  const smtp = getSmtpPublicConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: true,
    auth: {
      user: auth.user,
      pass: auth.pass,
    },
  });

  try {
    const mailOptions = {
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      headers: {
        'X-Apropos-Thread-Id': params.threadId.slice(0, 200),
        'X-Apropos-Request-Id': params.requestId.slice(0, 200),
      },
      ...(params.attachments?.length
        ? {
            attachments: params.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, 'base64'),
              contentType: a.contentType,
            })),
          }
        : {}),
    };
    const info = await transporter.sendMail(mailOptions);

    const messageId = typeof info.messageId === 'string' ? info.messageId : undefined;
    let sentCopyArchived = false;
    let sentCopyMailbox: string | undefined;
    let sentCopyError: string | undefined;
    try {
      const raw = await new MailComposer({
        ...mailOptions,
        ...(messageId ? { messageId } : {}),
      })
        .compile()
        .build();
      const archived = await appendLivSentCopy(raw);
      sentCopyArchived = archived.ok;
      sentCopyMailbox = archived.mailboxPath;
      sentCopyError = archived.error;
    } catch (archiveError) {
      sentCopyError =
        archiveError instanceof Error ? archiveError.message : String(archiveError);
    }

    return {
      ok: true,
      transport: 'smtp',
      messageId,
      subject: params.subject,
      replyTo: params.replyTo,
      from: params.from,
      sentCopyArchived,
      sentCopyMailbox,
      sentCopyError,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      transport: 'smtp',
      error: msg,
      subject: params.subject,
      replyTo: params.replyTo,
      from: params.from,
    };
  } finally {
    transporter.close();
  }
}

async function sendViaResend(
  params: SendAccreditationEmailParams & {
    from: string;
    replyTo: string;
    subject: string;
    html: string;
    text?: string;
    hash: string;
  }
): Promise<SendAccreditationEmailResult> {
  const apiKey = (env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      transport: 'resend',
      error: 'RESEND_API_KEY mangler',
      subject: params.subject,
      replyTo: params.replyTo,
      from: params.from,
    };
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      ...(params.attachments?.length
        ? {
            attachments: params.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              ...(a.contentType ? { content_type: a.contentType } : {}),
            })),
          }
        : {}),
      headers: {
        'X-Apropos-Thread-Id': params.threadId.slice(0, 200),
        'X-Apropos-Request-Id': params.requestId.slice(0, 200),
      },
      tags: [
        { name: 'accreditation_thread_id', value: params.threadId.slice(0, 256) },
        { name: 'accreditation_request_id', value: params.requestId.slice(0, 256) },
      ],
    },
    { idempotencyKey: `accreditation-send/${params.threadId}/${params.hash}`.slice(0, 256) }
  );

  if (error) {
    return {
      ok: false,
      transport: 'resend',
      error: error.message,
      subject: params.subject,
      replyTo: params.replyTo,
      from: params.from,
    };
  }
  if (!data?.id) {
    return {
      ok: false,
      transport: 'resend',
      error: 'Resend returnerede intet id',
      subject: params.subject,
      replyTo: params.replyTo,
      from: params.from,
    };
  }
  return {
    ok: true,
    transport: 'resend',
    resendEmailId: data.id,
    messageId: data.id,
    subject: params.subject,
    replyTo: params.replyTo,
    from: params.from,
  };
}

/**
 * Send accreditation mail via configured transport.
 * Default/primary: one.com SMTP (root From). Resend only when ACCREDITATION_MAIL_TRANSPORT=resend.
 * Never silently falls back from SMTP → Resend/news sender.
 */
export async function sendAccreditationEmail(
  params: SendAccreditationEmailParams
): Promise<SendAccreditationEmailResult> {
  const transport = getAccreditationMailTransport();
  const from =
    transport === 'smtp' ? resolveSmtpFrom() : getAccreditationFromEmail();
  const replyTo = getAccreditationReplyTo(params.threadId);
  const subject = ensureRequestIdInSubject(params.subject, params.requestId);
  const text = params.text != null ? sanitizeLivOutput(params.text) : undefined;
  const html = sanitizeLivOutput(params.html);

  const hash =
    params.draftHash ||
    createHash('sha256')
      .update(`${params.threadId}:${subject}:${html}:${params.attachments?.length || 0}`)
      .digest('hex')
      .slice(0, 16);

  if (transport === 'smtp') {
    return sendViaSmtp({
      ...params,
      from,
      replyTo,
      subject,
      html,
      text,
    });
  }

  return sendViaResend({
    ...params,
    from,
    replyTo,
    subject,
    html,
    text,
    hash,
  });
}
