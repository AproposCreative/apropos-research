/**
 * Outbound safety for Liv accreditation mail.
 *
 * When ACCREDITATION_TEST_REDIRECT_TO is set (e.g. frederik.emil.kragh@gmail.com):
 * - every outbound message is rewritten to that sink
 * - allowlist defaults to the sink only (nothing else can be mailed)
 * - dry-run is off unless ACCREDITATION_DRY_RUN=true (so you can read real SMTP mail)
 */

import { extractEmailAddress } from '@/lib/accreditation/mail-transport';

export const ACCREDITATION_TEST_SINK_DEFAULT = 'frederik.emil.kragh@gmail.com';

export function getAccreditationTestRedirectTo(): string | null {
  const raw = (process.env.ACCREDITATION_TEST_REDIRECT_TO || '').trim().toLowerCase();
  if (!raw || raw === '0' || raw === 'false' || raw === 'off') return null;
  const email = extractEmailAddress(raw) || raw;
  return email.includes('@') ? email : null;
}

/** True while test redirect is active — used to force a real send of drafts to the sink. */
export function isAccreditationTestRedirectActive(): boolean {
  return Boolean(getAccreditationTestRedirectTo());
}

export function getAccreditationOutboundAllowlist(): Set<string> | null {
  const explicit = (process.env.ACCREDITATION_OUTBOUND_ALLOWLIST || '')
    .split(',')
    .map((s) => extractEmailAddress(s.trim().toLowerCase()) || s.trim().toLowerCase())
    .filter((s) => s.includes('@'));
  if (explicit.length > 0) return new Set(explicit);

  const redirect = getAccreditationTestRedirectTo();
  if (redirect) return new Set([redirect]);
  return null;
}

export type ResolvedOutboundRecipient = {
  to: string;
  intendedTo: string;
  redirected: boolean;
  blocked: boolean;
  blockReason?: string;
};

export function resolveAccreditationOutboundRecipient(
  intendedTo: string
): ResolvedOutboundRecipient {
  const intended =
    extractEmailAddress(intendedTo.trim().toLowerCase()) || intendedTo.trim().toLowerCase();
  const redirect = getAccreditationTestRedirectTo();
  const allowlist = getAccreditationOutboundAllowlist();

  if (redirect) {
    if (allowlist && !allowlist.has(redirect)) {
      return {
        to: redirect,
        intendedTo: intended,
        redirected: true,
        blocked: true,
        blockReason: `Test-redirect ${redirect} er ikke på allowlisten`,
      };
    }
    return {
      to: redirect,
      intendedTo: intended || '(ukendt)',
      redirected: true,
      blocked: false,
    };
  }

  if (allowlist && intended && !allowlist.has(intended)) {
    return {
      to: intended,
      intendedTo: intended,
      redirected: false,
      blocked: true,
      blockReason: `Modtager ${intended} er ikke på ACCREDITATION_OUTBOUND_ALLOWLIST`,
    };
  }

  return {
    to: intendedTo.trim(),
    intendedTo: intended || intendedTo.trim(),
    redirected: false,
    blocked: false,
  };
}

export function applyTestRedirectToMailContent(params: {
  subject: string;
  text?: string;
  html: string;
  intendedTo: string;
  redirected: boolean;
}): { subject: string; text?: string; html: string } {
  if (!params.redirected) {
    return { subject: params.subject, text: params.text, html: params.html };
  }
  const banner = `TEST-REDIRECT: oprindelig modtager var ${params.intendedTo}. Sendt kun til test-sink.`;
  const subject = params.subject.startsWith('[TEST')
    ? params.subject
    : `[TEST → ${params.intendedTo}] ${params.subject}`;
  const text = params.text != null ? `${banner}\n\n${params.text}` : undefined;
  const html = `<p style="color:#b45309;font-size:12px;border:1px solid rgba(180,83,9,0.35);padding:8px 10px;border-radius:8px;">${banner}</p>${params.html}`;
  return { subject, text, html };
}

export function getAccreditationOutboundSafetyPublic(): {
  testRedirectTo: string | null;
  allowlist: string[] | null;
  forceSendOnApprove: boolean;
} {
  const redirect = getAccreditationTestRedirectTo();
  const allowlist = getAccreditationOutboundAllowlist();
  return {
    testRedirectTo: redirect,
    allowlist: allowlist ? Array.from(allowlist) : null,
    forceSendOnApprove: Boolean(redirect),
  };
}
