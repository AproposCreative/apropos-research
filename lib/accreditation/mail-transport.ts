import { env } from '@/lib/config/env';
import { DEFAULT_FROM_DISPLAY, LIV_MAILBOX } from '@/lib/accreditation/types';

export type AccreditationMailTransport = 'smtp' | 'resend';

/** Canonical production From for Liv accreditation (one.com root mailbox). */
export const ACCREDITATION_ROOT_FROM_DISPLAY = DEFAULT_FROM_DISPLAY;
export const ACCREDITATION_ROOT_FROM_EMAIL = LIV_MAILBOX;
export const ACCREDITATION_FORBIDDEN_FROM_DOMAIN = 'news.aproposmagazine.com';

const DEFAULT_SMTP_HOST = 'send.one.com';
const DEFAULT_SMTP_PORT = 465;

/** Prefer runtime process.env so tests/overrides apply after module load. */
export function readAccreditationEnv(key: string): string {
  const fromProcess = (process.env[key] || '').trim();
  if (fromProcess) return fromProcess;
  const fromParsed = (env as unknown as Record<string, unknown>)[key];
  return typeof fromParsed === 'string' ? fromParsed.trim() : '';
}

export function extractEmailAddress(fromOrEmail: string): string {
  const t = fromOrEmail.trim();
  const m = t.match(/<([^>]+)>/);
  return (m?.[1] || t).trim().toLowerCase();
}

export function normalizeAccreditationFrom(raw: string): string {
  const t = raw.trim();
  if (!t) return ACCREDITATION_ROOT_FROM_DISPLAY;
  if (t.includes('<') && t.includes('>')) return t;
  if (/^[^\s<>]+@[^\s<>]+$/.test(t)) return `Liv Brandt <${t}>`;
  return t;
}

/**
 * Production primary is one.com SMTP. Resend only when explicitly selected —
 * never a silent fallback from SMTP failures.
 */
export function getAccreditationMailTransport(): AccreditationMailTransport {
  const t = readAccreditationEnv('ACCREDITATION_MAIL_TRANSPORT').toLowerCase();
  if (t === 'resend') return 'resend';
  if (t === 'smtp') return 'smtp';
  return 'smtp';
}

export function isForbiddenNewsFrom(fromOrEmail: string): boolean {
  const email = extractEmailAddress(fromOrEmail);
  const domain = email.includes('@') ? email.split('@')[1] : '';
  return domain === ACCREDITATION_FORBIDDEN_FROM_DOMAIN || email.endsWith(`@${ACCREDITATION_FORBIDDEN_FROM_DOMAIN}`);
}

/**
 * Reject any From that is not the root liv@aproposmagazine.com identity.
 * Used for SMTP path so news.aproposmagazine.com can never go out via one.com.
 */
export function assertSmtpFromAllowed(fromOrEmail: string): void {
  const email = extractEmailAddress(fromOrEmail);
  if (isForbiddenNewsFrom(email)) {
    throw new Error(
      `SMTP From must not use ${ACCREDITATION_FORBIDDEN_FROM_DOMAIN} (identity violation). Use ${ACCREDITATION_ROOT_FROM_EMAIL}.`
    );
  }
  if (email !== ACCREDITATION_ROOT_FROM_EMAIL) {
    throw new Error(
      `SMTP From must be ${ACCREDITATION_ROOT_FROM_EMAIL}, got ${email || '(empty)'}`
    );
  }
}

/**
 * Resolve the From used for SMTP sends. Always the root Liv identity.
 * - Env news.* / missing → coerce to root (never send as news).
 * - Explicit candidate that is not root → throw (tests / callers that pass a From).
 */
export function resolveSmtpFrom(candidate?: string): string {
  const explicit = candidate !== undefined;
  const raw = (explicit ? candidate : readAccreditationEnv('ACCREDITATION_FROM_EMAIL')).trim();

  if (explicit) {
    if (!raw) {
      return ACCREDITATION_ROOT_FROM_DISPLAY;
    }
    const normalized = normalizeAccreditationFrom(raw);
    assertSmtpFromAllowed(normalized);
    return normalized.includes('<')
      ? normalized
      : `Liv Brandt <${extractEmailAddress(normalized)}>`;
  }

  if (!raw || isForbiddenNewsFrom(raw)) {
    return ACCREDITATION_ROOT_FROM_DISPLAY;
  }
  const normalized = normalizeAccreditationFrom(raw);
  if (extractEmailAddress(normalized) !== ACCREDITATION_ROOT_FROM_EMAIL) {
    return ACCREDITATION_ROOT_FROM_DISPLAY;
  }
  return normalized.includes('<')
    ? normalized
    : `Liv Brandt <${extractEmailAddress(normalized)}>`;
}

export type SmtpPublicConfig = {
  host: string;
  port: number;
  secure: true;
  user: string;
  passwordConfigured: boolean;
  authSource: 'smtp' | 'imap_fallback' | 'none';
};

export function getSmtpPublicConfig(): SmtpPublicConfig {
  const host = readAccreditationEnv('ONECOM_SMTP_HOST') || DEFAULT_SMTP_HOST;
  const portRaw = readAccreditationEnv('ONECOM_SMTP_PORT');
  const port = Number(portRaw || DEFAULT_SMTP_PORT) || DEFAULT_SMTP_PORT;
  const smtpUser = readAccreditationEnv('LIV_SMTP_USER');
  const imapUser = readAccreditationEnv('LIV_IMAP_USER');
  const user = smtpUser || imapUser || ACCREDITATION_ROOT_FROM_EMAIL;
  const smtpPass = readAccreditationEnv('LIV_SMTP_PASSWORD');
  const imapPass = readAccreditationEnv('LIV_IMAP_PASSWORD');
  const passwordConfigured = Boolean(smtpPass || imapPass);
  const authSource: SmtpPublicConfig['authSource'] = smtpPass
    ? 'smtp'
    : imapPass
      ? 'imap_fallback'
      : 'none';
  return {
    host,
    port,
    secure: true,
    user,
    passwordConfigured,
    authSource,
  };
}

/** Auth credentials for nodemailer — never log or return in status APIs. */
export function getSmtpAuthCredentials(): { user: string; pass: string } | null {
  const user =
    readAccreditationEnv('LIV_SMTP_USER') ||
    readAccreditationEnv('LIV_IMAP_USER') ||
    ACCREDITATION_ROOT_FROM_EMAIL;
  const pass =
    readAccreditationEnv('LIV_SMTP_PASSWORD') || readAccreditationEnv('LIV_IMAP_PASSWORD');
  if (!user.includes('@') || !pass) return null;
  return { user, pass };
}

export function getMailTransportPublicStatus(): {
  transport: AccreditationMailTransport;
  from: string;
  fromOk: boolean;
  smtp: SmtpPublicConfig;
  resendConfigured: boolean;
  ok: boolean;
  label: string;
  envFromMismatch: boolean;
} {
  const transport = getAccreditationMailTransport();
  const smtp = getSmtpPublicConfig();
  const envFrom = readAccreditationEnv('ACCREDITATION_FROM_EMAIL');
  const envFromMismatch = Boolean(envFrom && isForbiddenNewsFrom(envFrom));
  const from =
    transport === 'smtp'
      ? resolveSmtpFrom()
      : normalizeAccreditationFrom(envFrom || ACCREDITATION_ROOT_FROM_DISPLAY);
  const fromOk =
    transport === 'smtp'
      ? extractEmailAddress(from) === ACCREDITATION_ROOT_FROM_EMAIL && !isForbiddenNewsFrom(from)
      : Boolean(extractEmailAddress(from).includes('@'));
  const resendConfigured = Boolean(
    (env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim()
  );
  const ok =
    transport === 'smtp'
      ? fromOk && smtp.passwordConfigured
      : fromOk && resendConfigured;
  return {
    transport,
    from,
    fromOk,
    smtp,
    resendConfigured,
    ok,
    envFromMismatch,
    label:
      transport === 'smtp'
        ? `SMTP primary (${smtp.host}:${smtp.port}) · ${from}`
        : `Resend explicit · ${from}`,
  };
}
