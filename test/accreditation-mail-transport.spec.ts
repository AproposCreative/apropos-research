import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSmtpFromAllowed,
  extractEmailAddress,
  getAccreditationFromEmail,
  getAccreditationMailTransport,
  isForbiddenNewsFrom,
  resolveSmtpFrom,
} from '@/lib/accreditation/send-email';
import {
  ACCREDITATION_ROOT_FROM_DISPLAY,
  ACCREDITATION_ROOT_FROM_EMAIL,
} from '@/lib/accreditation/mail-transport';
import { DEFAULT_FROM_DISPLAY, LIV_MAILBOX } from '@/lib/accreditation/types';

const ENV_KEYS = [
  'ACCREDITATION_MAIL_TRANSPORT',
  'ACCREDITATION_FROM_EMAIL',
  'LIV_SMTP_USER',
  'LIV_SMTP_PASSWORD',
  'LIV_IMAP_USER',
  'LIV_IMAP_PASSWORD',
  'ONECOM_SMTP_HOST',
  'ONECOM_SMTP_PORT',
] as const;

const savedEnv: Record<string, string | undefined> = {};

function stashEnv() {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
}

function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

beforeEach(() => {
  stashEnv();
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.ACCREDITATION_MAIL_TRANSPORT = 'smtp';
});

afterEach(() => {
  restoreEnv();
});

describe('accreditation mail transport / SMTP From', () => {
  it('defaults transport to smtp and From to root liv@aproposmagazine.com', () => {
    expect(getAccreditationMailTransport()).toBe('smtp');
    expect(DEFAULT_FROM_DISPLAY).toBe('Liv Brandt <liv@aproposmagazine.com>');
    expect(getAccreditationFromEmail()).toBe(ACCREDITATION_ROOT_FROM_DISPLAY);
    expect(extractEmailAddress(getAccreditationFromEmail())).toBe(LIV_MAILBOX);
    expect(extractEmailAddress(getAccreditationFromEmail())).toBe(
      ACCREDITATION_ROOT_FROM_EMAIL
    );
  });

  it('ignores news.aproposmagazine.com env From under SMTP (no silent news send)', () => {
    process.env.ACCREDITATION_FROM_EMAIL =
      'Liv Brandt <liv@news.aproposmagazine.com>';
    expect(isForbiddenNewsFrom(process.env.ACCREDITATION_FROM_EMAIL)).toBe(true);
    expect(resolveSmtpFrom()).toBe(ACCREDITATION_ROOT_FROM_DISPLAY);
    expect(getAccreditationFromEmail()).toBe(ACCREDITATION_ROOT_FROM_DISPLAY);
  });

  it('assertSmtpFromAllowed accepts root From', () => {
    expect(() => assertSmtpFromAllowed('Liv Brandt <liv@aproposmagazine.com>')).not.toThrow();
    expect(() => assertSmtpFromAllowed('liv@aproposmagazine.com')).not.toThrow();
  });

  it('assertSmtpFromAllowed rejects news.* and mismatched SMTP From', () => {
    expect(() =>
      assertSmtpFromAllowed('Liv Brandt <liv@news.aproposmagazine.com>')
    ).toThrow(/news\.aproposmagazine\.com|identity violation/i);
    expect(() => assertSmtpFromAllowed('Liv Brandt <noreply@news.aproposmagazine.com>')).toThrow();
    expect(() => assertSmtpFromAllowed('Someone <wrong@aproposmagazine.com>')).toThrow(
      /must be liv@aproposmagazine\.com/i
    );
    expect(() => resolveSmtpFrom('presse@other.example')).toThrow(
      /must be liv@aproposmagazine\.com/i
    );
  });

  it('resend transport is only when explicitly selected', () => {
    process.env.ACCREDITATION_MAIL_TRANSPORT = 'resend';
    expect(getAccreditationMailTransport()).toBe('resend');
    process.env.ACCREDITATION_MAIL_TRANSPORT = 'smtp';
    expect(getAccreditationMailTransport()).toBe('smtp');
  });
});
