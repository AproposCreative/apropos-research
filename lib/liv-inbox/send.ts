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
import { Resend } from 'resend';
import { env } from '@/lib/config/env';
import {
  applyTestRedirectToMailContent,
  getAccreditationTestRedirectTo,
} from '@/lib/accreditation/outbound-safety';

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
} {
  return {
    enabled: isLivInboxSendingEnabled(),
    testRedirectTo: livInboxTestRedirectTo(),
    maxPerRun: livInboxMaxAutoSendPerRun(),
    allowedDomains: livInboxAllowedDomains(),
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

  const apiKey = (env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { sent: false, blocked: true, reason: 'RESEND_API_KEY mangler' };
  }

  const content = applyTestRedirectToMailContent({
    subject: params.subject,
    text: params.text,
    html: `<div style="font-family:inherit;white-space:pre-wrap">${escapeHtml(params.text)}</div>`,
    intendedTo: resolved.intendedTo,
    redirected: resolved.redirected,
  });

  const hash = createHash('sha256')
    .update(`${params.itemId}:${params.subject}`)
    .digest('hex')
    .slice(0, 16);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(
      {
        from: livInboxFromEmail(),
        to: resolved.to,
        subject: content.subject,
        html: content.html,
        text: content.text,
        tags: [{ name: 'liv_inbox_item', value: params.itemId.slice(0, 256) }],
      },
      { idempotencyKey: `liv-inbox-send/${params.itemId}/${hash}`.slice(0, 256) }
    );
    if (error) return { sent: false, reason: error.message, intendedTo: resolved.intendedTo };
    return {
      sent: true,
      id: data?.id,
      redirected: resolved.redirected,
      to: resolved.to,
      intendedTo: resolved.intendedTo,
    };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e), intendedTo: resolved.intendedTo };
  }
}
