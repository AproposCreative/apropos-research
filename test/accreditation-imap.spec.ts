import { beforeEach, describe, expect, it } from 'vitest';
import {
  correlateInboundToThread,
  extractRequestIdFromText,
  extractThreadIdFromAddresses,
  isActiveAccreditationThread,
} from '@/lib/accreditation/imap/correlate';
import {
  hasProcessedMessageId,
  markProcessedMessageId,
  normalizeMessageId,
  setCursor,
  getCursor,
} from '@/lib/accreditation/imap/cursor-store';
import {
  getGmailOptionalStatus,
  getMailboxPublicConfig,
  IMAP_ENV_NAMES,
  sanitizeImapError,
} from '@/lib/accreditation/imap/config';
import { isHistoricalInbound } from '@/lib/accreditation/imap/poll';
import { findSentMailboxPath } from '@/lib/accreditation/imap/sent-copy';
import { isTrustedInternalSender } from '@/lib/accreditation/inbound-intake';
import {
  getThreadById,
  updateThreadContact,
  writeEmailThreads,
} from '@/lib/accreditation/email-thread-store';
import { resetAllAccreditationStoresForTests } from '@/lib/accreditation/persistence/test-reset';
import type { AccreditationEmailThread } from '@/lib/accreditation/types';

beforeEach(async () => {
  await resetAllAccreditationStoresForTests();
});

describe('imap config safety', () => {
  it('exposes env names but never passwords in public config', () => {
    expect(IMAP_ENV_NAMES.livPassword).toBe('LIV_IMAP_PASSWORD');
    expect(IMAP_ENV_NAMES.frederikPassword).toBe('FREDERIK_IMAP_PASSWORD');
    const liv = getMailboxPublicConfig('liv');
    expect(liv.host).toBeTruthy();
    expect(liv.port).toBe(993);
    expect(liv.secure).toBe(true);
    expect(liv).not.toHaveProperty('password');
    expect(getGmailOptionalStatus().optional).toBe(true);
  });

  it('redacts passwords from error strings', () => {
    const secret = 'super-secret-pass-xyz';
    expect(sanitizeImapError(new Error(`auth failed ${secret}`), secret)).not.toContain(secret);
    expect(sanitizeImapError(new Error('password=abc123'), 'unused')).toMatch(/redacted/i);
  });
});

describe('imap cursor + dedupe', () => {
  it('tracks uid cursor and message-id dedupe', async () => {
    await setCursor('liv', 42);
    expect((await getCursor('liv')).lastUid).toBe(42);
    const mid = `<dedupe-test-${Date.now()}@example.com>`;
    expect(await hasProcessedMessageId(mid)).toBe(false);
    const first = await markProcessedMessageId(mid);
    expect(first.firstTime).toBe(true);
    expect(await hasProcessedMessageId(mid)).toBe(true);
    expect((await markProcessedMessageId(mid)).firstTime).toBe(false);
    expect(normalizeMessageId(mid)).toBe(mid.replace(/^<|>$/g, '').toLowerCase());
  });

  it('resolves the one.com Sent folder for Apple Mail visibility', () => {
    expect(
      findSentMailboxPath([
        { path: 'INBOX', name: 'INBOX' },
        { path: 'Sent', name: 'Sent', specialUse: '\\Sent' },
      ])
    ).toBe('Sent');
    expect(
      findSentMailboxPath([
        { path: 'INBOX', name: 'INBOX' },
        { path: 'Sendt', name: 'Sendt' },
      ])
    ).toBe('Sendt');
  });

  it('rejects historical replay and only trusts approved internal intake senders', () => {
    const now = Date.parse('2026-07-25T20:00:00.000Z');
    expect(isHistoricalInbound({ date: '2026-07-23T20:00:00.000Z' }, now)).toBe(true);
    expect(isHistoricalInbound({ date: '2026-07-25T19:55:00.000Z' }, now)).toBe(false);

    expect(isTrustedInternalSender('frederik@aproposmagazine.com')).toBe(true);
    expect(isTrustedInternalSender('frederik.emil.kragh@gmail.com')).toBe(true);
    expect(isTrustedInternalSender('press@festival.example')).toBe(false);
    expect(isTrustedInternalSender('no-reply@example.com')).toBe(false);
  });
});

describe('imap correlation', () => {
  it('extracts liv+ alias and LIV request ids', () => {
    expect(extractThreadIdFromAddresses(['Liv <liv+thread-xyz@inbound.example.com>'])).toBe(
      'thread-xyz'
    );
    expect(extractRequestIdFromText('Re: Presseakkreditering LIV-012')).toBe('LIV-012');
    expect(extractRequestIdFromText('Fwd: SV: Emne [LIV-088]')).toBe('LIV-088');
  });

  it('correlates by plus-alias to stored thread', async () => {
    const thread: AccreditationEmailThread = {
      id: 'thread-xyz',
      requestId: 'LIV-012',
      contactEmail: 'presse@venue.dk',
      subject: 'Presseakkreditering [LIV-012]',
      status: 'awaiting_reply',
      messages: [
        {
          id: 'm1',
          direction: 'outbound',
          messageId: 'outbound-1@resend',
          from: 'liv@aproposmagazine.com',
          to: 'presse@venue.dk',
          subject: 'Presseakkreditering [LIV-012]',
          sentAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeEmailThreads([thread]);
    const found = await correlateInboundToThread({
      fromEmail: 'presse@venue.dk',
      toAddresses: ['liv+thread-xyz@inbound.aproposmagazine.com'],
      subject: 'Re: Presseakkreditering [LIV-012]',
      text: 'I er godkendt',
      headers: {},
      inReplyTo: 'outbound-1@resend',
      references: ['outbound-1@resend'],
    });
    expect(found?.id).toBe('thread-xyz');
  });

  it('rejects a reply marker when the sender is not the reviewed thread contact', async () => {
    const now = new Date().toISOString();
    const thread: AccreditationEmailThread = {
      id: 'thread-reviewed',
      requestId: 'LIV-013',
      contactEmail: 'press@venue.dk',
      subject: 'Presseakkreditering [LIV-013]',
      status: 'awaiting_reply',
      messages: [
        {
          id: 'm-reviewed',
          direction: 'outbound',
          messageId: 'reviewed-outbound@example.com',
          from: 'liv@aproposmagazine.com',
          to: 'press@venue.dk',
          subject: 'Presseakkreditering [LIV-013]',
          sentAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await writeEmailThreads([thread]);

    const found = await correlateInboundToThread({
      fromEmail: 'unrelated@gmail.com',
      toAddresses: ['liv@aproposmagazine.com'],
      subject: 'Re: Presseakkreditering [LIV-013]',
      text: 'Jeg er ikke den godkendte kontakt.',
      headers: {},
      inReplyTo: 'reviewed-outbound@example.com',
      references: ['reviewed-outbound@example.com'],
    });

    expect(found).toBeUndefined();
  });

  it('accepts only the explicitly reviewed recipient after a manual recipient change', async () => {
    const now = new Date().toISOString();
    await writeEmailThreads([
      {
        id: 'thread-recipient-edit',
        requestId: 'LIV-014',
        contactEmail: 'wrong@example.com',
        subject: 'Presseakkreditering [LIV-014]',
        status: 'awaiting_reply',
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await updateThreadContact(
      'thread-recipient-edit',
      'reviewed@example.com',
      'Reviewed Contact'
    );
    expect((await getThreadById('thread-recipient-edit'))?.contactEmail).toBe(
      'reviewed@example.com'
    );

    const oldSender = await correlateInboundToThread({
      fromEmail: 'wrong@example.com',
      toAddresses: ['liv@aproposmagazine.com'],
      subject: 'Re: Presseakkreditering [LIV-014]',
      text: 'Old destination',
      headers: {},
    });
    const reviewedSender = await correlateInboundToThread({
      fromEmail: 'reviewed@example.com',
      toAddresses: ['liv@aproposmagazine.com'],
      subject: 'Re: Presseakkreditering [LIV-014]',
      text: 'Reviewed destination',
      headers: {},
    });

    expect(oldSender).toBeUndefined();
    expect(reviewedSender?.id).toBe('thread-recipient-edit');
  });

  it('never reopens an old thread by sender address or subject similarity', async () => {
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const thread: AccreditationEmailThread = {
      id: 'thread-old',
      requestId: 'LIV-099',
      contactEmail: 'press@festival.example',
      subject: 'Presseakkreditering til gammel festival [LIV-099]',
      status: 'awaiting_reply',
      messages: [],
      createdAt: oldDate,
      updatedAt: oldDate,
    };
    await writeEmailThreads([thread]);

    expect(isActiveAccreditationThread(thread)).toBe(false);
    const found = await correlateInboundToThread({
      fromEmail: 'press@festival.example',
      toAddresses: ['liv@aproposmagazine.com'],
      subject: 'Re: Presseakkreditering til gammel festival',
      text: 'Ny og urelateret mail',
      headers: {},
    });
    expect(found).toBeUndefined();
  });
});
