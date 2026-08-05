/**
 * one.com IMAP mailbox config.
 * Passwords are read only from process.env / deployment secrets.
 * Never return password values from any function in this module.
 */

export type MailboxId = 'liv' | 'frederik';

export type ImapMailboxPublicConfig = {
  id: MailboxId;
  host: string;
  port: number;
  secure: true;
  user: string;
  /** True if password env is non-empty — never the password itself. */
  passwordConfigured: boolean;
  role: 'accreditation_agent' | 'editor_archive';
};

export type ImapMailboxSecrets = {
  id: MailboxId;
  host: string;
  port: number;
  user: string;
  password: string;
};

const DEFAULT_HOST = 'imap.one.com';
const DEFAULT_PORT = 993;

function readHost(): string {
  return (
    process.env.ONECOM_IMAP_HOST ||
    process.env.ACCREDITATION_IMAP_HOST ||
    DEFAULT_HOST
  ).trim();
}

function readPort(): number {
  const raw = (process.env.ONECOM_IMAP_PORT || process.env.ACCREDITATION_IMAP_PORT || String(DEFAULT_PORT)).trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}

/** Env var names for setup UI / docs — safe to expose. */
export const IMAP_ENV_NAMES = {
  host: 'ONECOM_IMAP_HOST',
  port: 'ONECOM_IMAP_PORT',
  livUser: 'LIV_IMAP_USER',
  livPassword: 'LIV_IMAP_PASSWORD',
  frederikUser: 'FREDERIK_IMAP_USER',
  frederikPassword: 'FREDERIK_IMAP_PASSWORD',
  /** Optional Resend receiving subdomain (does not change root MX). */
  resendInboundDomain: 'ACCREDITATION_INBOUND_DOMAIN',
  /** Explicitly optional — not used for production one.com hosting. */
  gmailOptional: 'GMAIL_IMAP_OPTIONAL',
} as const;

export function getMailboxPublicConfig(id: MailboxId): ImapMailboxPublicConfig {
  const host = readHost();
  const port = readPort();
  if (id === 'liv') {
    const user = (process.env.LIV_IMAP_USER || 'liv@aproposmagazine.com').trim();
    const passwordConfigured = Boolean((process.env.LIV_IMAP_PASSWORD || '').trim());
    return {
      id,
      host,
      port,
      secure: true,
      user,
      passwordConfigured,
      role: 'accreditation_agent',
    };
  }
  const user = (process.env.FREDERIK_IMAP_USER || 'frederik@aproposmagazine.com').trim();
  const passwordConfigured = Boolean((process.env.FREDERIK_IMAP_PASSWORD || '').trim());
  return {
    id,
    host,
    port,
    secure: true,
    user,
    passwordConfigured,
    role: 'editor_archive',
  };
}

/**
 * Server-only: resolve secrets for IMAP connect.
 * Throws if password missing. Never log the return value.
 */
export function getMailboxSecrets(id: MailboxId): ImapMailboxSecrets {
  const pub = getMailboxPublicConfig(id);
  const password =
    id === 'liv'
      ? (process.env.LIV_IMAP_PASSWORD || '').trim()
      : (process.env.FREDERIK_IMAP_PASSWORD || '').trim();
  if (!password) {
    throw new Error(
      id === 'liv'
        ? 'LIV_IMAP_PASSWORD is not configured'
        : 'FREDERIK_IMAP_PASSWORD is not configured'
    );
  }
  return {
    id,
    host: pub.host,
    port: pub.port,
    user: pub.user,
    password,
  };
}

export function getGmailOptionalStatus(): {
  optional: true;
  configured: boolean;
  label: string;
} {
  const configured = Boolean(
    (process.env.GMAIL_IMAP_USER || process.env.GMAIL_IMAP_PASSWORD || '').trim()
  );
  return {
    optional: true,
    configured,
    label: configured
      ? 'Gmail IMAP vars present but unused (one.com is production)'
      : 'Gmail optional — not required; one.com hosts frederik@ and liv@',
  };
}

/** Safe error message — strip any accidental password leakage. */
export function sanitizeImapError(err: unknown, password?: string): string {
  let msg = err instanceof Error ? err.message : String(err);
  if (password && password.length > 0) {
    msg = msg.split(password).join('[redacted]');
  }
  // Also redact common auth blobs
  msg = msg.replace(/password[=:]\s*\S+/gi, 'password=[redacted]');
  return msg.slice(0, 300);
}
