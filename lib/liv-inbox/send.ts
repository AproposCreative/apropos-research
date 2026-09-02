/**
 * Outbound sending for Liv Indbakke — fail-closed and heavily gated to make a
 * mass-send accident impossible.
 *
 * Layered safety:
 *  1. Master kill-switch: LIV_INBOX_SENDING_ENABLED must be exactly "true".
 *  2. Test-redirect: reuses the accreditation outbound-safety resolver, so when
 *     ACCREDITATION_TEST_REDIRECT_TO (or LIV_INBOX_TEST_REDIRECT_TO) is set,
 *     EVERY mail is rewritten to that sink and nothing reaches real recipients.
 *  3. Allowlist fail-closed: with no redirect sink, a recipient must be on the
 *     allowlist or the send is blocked.
 *  4. Per-run cap for auto-sends (enforced by the caller).
 *  5. Idempotency key (per item) so the same reply is never sent twice.
 */
import { createHash } from 'crypto';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { Resend } from 'resend';
import { env } from '@/lib/config/env';
import {
  applyTestRedirectToMailContent,
  getAccreditationTestRedirectTo,
} from '@/lib/accreditation/outbound-safety';
import {
  assertSmtpFromAllowed,
  getSmtpAuthCredentials,
  getSmtpPublicConfig,
  resolveSmtpFrom,
} from '@/lib/accreditation/mail-transport';
import { getAccreditationReplyToFallbackEmail } from '@/lib/accreditation/send-email';
import { appendLivSentCopy } from '@/lib/accreditation/imap/sent-copy';

export function isLivInboxSendingEnabled(): boolean {
  return process.env.LIV_INBOX_SENDING_ENABLED === 'true';
}

export function livInboxMaxAutoSendPerRun(): number {
  const n = Number(process.env.LIV_INBOX_MAX_AUTOSEND_PER_RUN || 5);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 25) : 5;
}

export function livInboxTestRedirectTo(): string | null {
  const own = (process.env.LIV_INBOX_TEST_REDIRECT_TO || '').trim().toLowerCase();
  if (own && own.includes('@')) return own;
  return getAccreditationTestRedirectTo();
}

/**
 * Trusted recipient domains that receive REAL replies (bypassing test-redirect).
 * Use for internal domains only (e.g. aproposmagazine.com) so a team can test
 * Liv's replies for real, while everyone else stays protected.
 */
export function livInboxAllowedDomains(): string[] {
  return (process.env.LIV_INBOX_ALLOWED_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

/**
 * Transport for Liv's replies. Default: her one.com SMTP (so mail is sent from
 * her mailbox and archived to her Sent folder for monitoring); falls back to
 * Resend only when SMTP auth is unavailable. Override with LIV_INBOX_MAIL_TRANSPORT.
 */
export function livInboxMailTransport(): 'smtp' | 'resend' {
  const explicit = (process.env.LIV_INBOX_MAIL_TRANSPORT || '').trim().toLowerCase();
  if (explicit === 'resend') return 'resend';
  if (explicit === 'smtp') return 'smtp';
  return getSmtpAuthCredentials() ? 'smtp' : 'resend';
}

function livInboxFromEmail(): string {
  const raw = (
    process.env.LIV_INBOX_FROM_EMAIL ||
    env.RESEND_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    ''
  ).trim();
  if (!raw) return 'Liv Brandt <liv@aproposmagazine.com>';
  if (raw.includes('<') && raw.includes('>')) return raw;
  if (/^[^\s<>]+@[^\s<>]+$/.test(raw)) return `Liv Brandt <${raw}>`;
  return raw;
}

/** Public config for the UI (no secrets). */
export function livInboxSendingStatus(): {
  enabled: boolean;
  testRedirectTo: string | null;
  maxPerRun: number;
  allowedDomains: string[];
  transport: 'smtp' | 'resend';
} {
  return {
    enabled: isLivInboxSendingEnabled(),
    testRedirectTo: livInboxTestRedirectTo(),
    maxPerRun: livInboxMaxAutoSendPerRun(),
    allowedDomains: livInboxAllowedDomains(),
    transport: livInboxMailTransport(),
  };
}

/**
 * Fail-closed recipient resolution for Liv Indbakke:
 *  - a configured test-redirect sink always wins (everything goes there),
 *  - otherwise the recipient MUST be on the allowlist or the send is blocked.
 */
export function resolveLivInboxRecipient(intendedTo: string): {
  to: string;
  intendedTo: string;
  redirected: boolean;
  blocked: boolean;
  reason?: string;
} {
  const intended = intendedTo.trim().toLowerCase();
  const domain = intended.includes('@') ? intended.split('@')[1] || '' : '';

  // Trusted internal domains get a REAL reply (no redirect) so a team can test.
  if (domain && livInboxAllowedDomains().includes(domain)) {
    return { to: intended, intendedTo: intended, redirected: false, blocked: false };
  }

  const redirect = livInboxTestRedirectTo();
  if (redirect) {
    return { to: redirect, intendedTo: intended, redirected: true, blocked: false };
  }
  const allow = (process.env.LIV_INBOX_OUTBOUND_ALLOWLIST || process.env.ACCREDITATION_OUTBOUND_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));
  if (allow.length === 0) {
    return {
      to: intended,
      intendedTo: intended,
      redirected: false,
      blocked: true,
      reason: 'Ingen test-redirect og ingen allowlist (fail-closed)',
    };
  }
  if (!allow.includes(intended)) {
    return {
      to: intended,
      intendedTo: intended,
      redirected: false,
      blocked: true,
      reason: `${intended} er ikke på allowlisten`,
    };
  }
  return { to: intended, intendedTo: intended, redirected: false, blocked: false };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface LivSendResult {
  sent: boolean;
  blocked?: boolean;
  reason?: string;
  id?: string;
  redirected?: boolean;
  to?: string;
  intendedTo?: string;
  transport?: 'smtp' | 'resend';
  /** True when the sent copy was archived to Liv's Sent folder (SMTP only). */
  sentCopyArchived?: boolean;
}

function buildHtml(text: string): string {
  return `<div style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

type TransportSendParams = {
  itemId: string;
  to: string;
  subject: string;
  text?: string;
  html: string;
  redirected: boolean;
  intendedTo: string;
};

/** Send from Liv's one.com mailbox and archive a copy to her Sent folder. */
async function sendViaLivInboxSmtp(p: TransportSendParams): Promise<LivSendResult> {
  const from = resolveSmtpFrom(); // liv@aproposmagazine.com
  try {
    assertSmtpFromAllowed(from);
  } catch (e) {
    return { sent: false, blocked: true, transport: 'smtp', reason: e instanceof Error ? e.message : String(e), intendedTo: p.intendedTo };
  }
  const auth = getSmtpAuthCredentials();
  if (!auth) {
    return {
      sent: false,
      blocked: true,
      transport: 'smtp',
      reason: 'SMTP-auth mangler (LIV_SMTP_PASSWORD eller LIV_IMAP_PASSWORD)',
      intendedTo: p.intendedTo,
    };
  }
  const smtp = getSmtpPublicConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: true,
    auth: { user: auth.user, pass: auth.pass },
  });
  try {
    const mailOptions = {
      from,
      to: p.to,
      subject: p.subject,
      html: p.html,
      text: p.text,
      replyTo: getAccreditationReplyToFallbackEmail(),
      headers: { 'X-Apropos-LivInbox-Item': p.itemId.slice(0, 200) },
    };
    const info = await transporter.sendMail(mailOptions);
    const messageId = typeof info.messageId === 'string' ? info.messageId : undefined;
    let sentCopyArchived = false;
    try {
      const raw = await new MailComposer({ ...mailOptions, ...(messageId ? { messageId } : {}) })
        .compile()
        .build();
      const archived = await appendLivSentCopy(raw);
      sentCopyArchived = archived.ok;
    } catch {
      /* Sent-folder archiving is best-effort */
    }
    return {
      sent: true,
      id: messageId,
      transport: 'smtp',
      redirected: p.redirected,
      to: p.to,
      intendedTo: p.intendedTo,
      sentCopyArchived,
    };
  } catch (e) {
    return { sent: false, transport: 'smtp', reason: e instanceof Error ? e.message : String(e), intendedTo: p.intendedTo };
  } finally {
    transporter.close();
  }
}

async function sendViaLivInboxResend(p: TransportSendParams): Promise<LivSendResult> {
  const apiKey = (env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { sent: false, blocked: true, transport: 'resend', reason: 'RESEND_API_KEY mangler', intendedTo: p.intendedTo };
  }
  const hash = createHash('sha256').update(`${p.itemId}:${p.subject}`).digest('hex').slice(0, 16);
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(
      {
        from: livInboxFromEmail(),
        to: p.to,
        subject: p.subject,
        html: p.html,
        text: p.text,
        tags: [{ name: 'liv_inbox_item', value: p.itemId.slice(0, 256) }],
      },
      { idempotencyKey: `liv-inbox-send/${p.itemId}/${hash}`.slice(0, 256) }
    );
    if (error) return { sent: false, transport: 'resend', reason: error.message, intendedTo: p.intendedTo };
    return {
      sent: true,
      id: data?.id,
      transport: 'resend',
      redirected: p.redirected,
      to: p.to,
      intendedTo: p.intendedTo,
    };
  } catch (e) {
    return { sent: false, transport: 'resend', reason: e instanceof Error ? e.message : String(e), intendedTo: p.intendedTo };
  }
}

export async function sendLivInboxReply(params: {
  itemId: string;
  to: string;
  subject: string;
  text: string;
}): Promise<LivSendResult> {
  if (!isLivInboxSendingEnabled()) {
    return { sent: false, blocked: true, reason: 'LIV_INBOX_SENDING_ENABLED er ikke slået til (skygge-tilstand)' };
  }

  const resolved = resolveLivInboxRecipient(params.to);
  if (resolved.blocked) {
    return {
      sent: false,
      blocked: true,
      reason: resolved.reason || 'Blokeret af allowlist',
      intendedTo: resolved.intendedTo,
    };
  }

  const content = applyTestRedirectToMailContent({
    subject: params.subject,
    text: params.text,
    html: buildHtml(params.text),
    intendedTo: resolved.intendedTo,
    redirected: resolved.redirected,
  });

  const common: TransportSendParams = {
    itemId: params.itemId,
    to: resolved.to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    redirected: resolved.redirected,
    intendedTo: resolved.intendedTo,
  };

  return livInboxMailTransport() === 'smtp'
    ? sendViaLivInboxSmtp(common)
    : sendViaLivInboxResend(common);
}
