/**
 * Hard rule: only real @aproposmagazine.com mailboxes may give Liv tasks
 * (or answer her editor-loop questions) over email. Not configurable.
 *
 * Exact domain match — never a suffix/contains check — so lookalikes like
 * aproposmagazine.com.evil.com or news.aproposmagazine.com cannot slip through.
 */

export const APROPOS_STAFF_DOMAIN = 'aproposmagazine.com';
export const LIV_STAFF_MAILBOX = 'liv@aproposmagazine.com';

/** Automated / Liv's own locals that must never be treated as a human tasker. */
const BLOCKED_LOCALS = new Set([
  'liv',
  'noreply',
  'no-reply',
  'no_reply',
  'news',
  'mailer-daemon',
  'postmaster',
  'bounce',
]);

/**
 * Pull a bare address out of `Name <addr>` / quoted / padded input.
 * Uses the last `@` so `a@b@c.com` cannot be parsed as domain `b@c.com`.
 */
export function normalizeMailbox(raw: string | null | undefined): string {
  const trimmed = String(raw || '').trim().toLowerCase();
  if (!trimmed) return '';
  const angle = trimmed.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : trimmed).replace(/^mailto:/, '').trim();
  const at = candidate.lastIndexOf('@');
  if (at <= 0 || at === candidate.length - 1) return '';
  const local = candidate.slice(0, at).replace(/^"+|"+$/g, '').trim();
  const domain = candidate.slice(at + 1).replace(/\.$/, '').trim();
  if (!local || !domain) return '';
  return `${local}@${domain}`;
}

function localPart(email: string): string {
  return email.slice(0, email.lastIndexOf('@'));
}

function domainPart(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

/**
 * True only for a human staff mailbox on the exact root domain.
 * Rejects Liv herself, noreply/news, subdomains, and lookalike domains.
 */
export function isAproposStaffEmail(raw: string | null | undefined): boolean {
  const email = normalizeMailbox(raw);
  if (!email) return false;
  if (domainPart(email) !== APROPOS_STAFF_DOMAIN) return false;
  const local = localPart(email);
  if (!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/i.test(local)) return false;
  const base = local.split('+')[0] || '';
  if (!base || BLOCKED_LOCALS.has(base)) return false;
  return true;
}

/**
 * When Authentication-Results is present, fail closed on an explicit spoof
 * of @aproposmagazine.com (DMARC fail, or SPF+DKIM both fail). Missing
 * headers are not treated as a fail — unit tests and some IMAP paths omit them.
 */
export function staffFromAuthLooksForged(headers?: Record<string, string> | null): boolean {
  if (!headers) return false;
  const ar = String(
    headers['authentication-results'] || headers['authentication-results-original'] || ''
  ).toLowerCase();
  if (!ar.trim()) return false;
  if (/\bdmarc=(fail|quarantine)\b/.test(ar)) return true;
  const spfFail = /\bspf=(fail|softfail|permerror)\b/.test(ar);
  const dkimFail = /\bdkim=(fail|permerror|none)\b/.test(ar);
  return spfFail && dkimFail;
}

/** Staff mailbox AND (when headers exist) not an auth-failed spoof. */
export function canGiveLivTasks(
  raw: string | null | undefined,
  headers?: Record<string, string> | null
): boolean {
  return isAproposStaffEmail(raw) && !staffFromAuthLooksForged(headers);
}
