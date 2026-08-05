import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  correlateInboundToThread,
  extractRequestIdFromText,
  normalizeSubjectForMatch,
} from '@/lib/accreditation/imap/correlate';
import { writeEmailThreads } from '@/lib/accreditation/email-thread-store';
import { writeRequests } from '@/lib/accreditation/request-store';
import {
  getAccreditationReplyTo,
  getAccreditationReplyToFallbackEmail,
  getAccreditationMailIdentityPublic,
} from '@/lib/accreditation/send-email';
import {
  containsForbiddenDash,
  ensureRequestIdInSubject,
  extractBracketRequestId,
  sanitizeLivOutput,
} from '@/lib/accreditation/sanitize';
import {
  loadMemoryForReply,
  updateMemoryAfterEvent,
  __setMemoryBackendForTests,
} from '@/lib/accreditation/memory-store';
import { createInMemoryMemoryBackend } from '@/lib/accreditation/memory-json-adapter';
import { resetAllAccreditationStoresForTests } from '@/lib/accreditation/persistence/test-reset';
import type { AccreditationEmailThread, AccreditationRequest } from '@/lib/accreditation/types';

const ENV_KEYS = [
  'ACCREDITATION_INBOUND_DOMAIN',
  'ACCREDITATION_REPLY_TO_EMAIL',
  'LIV_IMAP_USER',
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

beforeEach(async () => {
  await resetAllAccreditationStoresForTests();
  const mem = createInMemoryMemoryBackend();
  __setMemoryBackendForTests('memory', mem);
  await mem.resetForTests?.();
});

afterEach(() => {
  restoreEnv();
  __setMemoryBackendForTests(null);
});

describe('sanitizeLivOutput / em dash ban', () => {
  it('strips em dash and en dash from Liv output', () => {
    const raw = 'Hej — velkommen – til Apropos';
    const clean = sanitizeLivOutput(raw);
    expect(containsForbiddenDash(clean)).toBe(false);
    expect(clean).not.toMatch(/\u2014|\u2013/);
    expect(clean).toContain(' - ');
    expect(clean).toContain('-');
  });

  it('ensureRequestIdInSubject inserts [LIV-123] exactly once', () => {
    expect(ensureRequestIdInSubject('Presseakkreditering', 'LIV-123')).toBe(
      'Presseakkreditering [LIV-123]'
    );
    expect(ensureRequestIdInSubject('Presseakkreditering [LIV-123]', 'LIV-123')).toBe(
      'Presseakkreditering [LIV-123]'
    );
    expect(ensureRequestIdInSubject('Re: foo LIV-123 bar [LIV-999]', 'LIV-123')).toBe(
      'Re: foo bar [LIV-123]'
    );
    expect(extractBracketRequestId('Fwd: Re: Presse [LIV-045]')).toBe('LIV-045');
    const withDash = ensureRequestIdInSubject('Emne — test', 'LIV-7');
    expect(containsForbiddenDash(withDash)).toBe(false);
    expect(withDash).toMatch(/\[LIV-7\]$/);
  });
});

describe('Reply-To fallback vs plus-alias', () => {
  it('uses ACCREDITATION_REPLY_TO_EMAIL when inbound domain unset', () => {
    stashEnv();
    delete process.env.ACCREDITATION_INBOUND_DOMAIN;
    process.env.ACCREDITATION_REPLY_TO_EMAIL = 'liv@aproposmagazine.com';
    expect(getAccreditationReplyToFallbackEmail()).toBe('liv@aproposmagazine.com');
    expect(getAccreditationReplyTo('thread-abc')).toBe('liv@aproposmagazine.com');
    const pub = getAccreditationMailIdentityPublic();
    expect(pub.replyToMode).toBe('fallback_mailbox');
    expect(pub.replyToExample).toBe('liv@aproposmagazine.com');
    expect(pub.ok).toBe(true);
  });

  it('falls back to LIV_IMAP_USER then liv@aproposmagazine.com', () => {
    stashEnv();
    delete process.env.ACCREDITATION_INBOUND_DOMAIN;
    delete process.env.ACCREDITATION_REPLY_TO_EMAIL;
    process.env.LIV_IMAP_USER = 'liv@aproposmagazine.com';
    expect(getAccreditationReplyTo('x')).toBe('liv@aproposmagazine.com');
    delete process.env.LIV_IMAP_USER;
    expect(getAccreditationReplyTo('x')).toBe('liv@aproposmagazine.com');
  });

  it('prefers liv+{threadId}@inbound domain only when configured', () => {
    stashEnv();
    process.env.ACCREDITATION_INBOUND_DOMAIN = 'inbound.example.com';
    process.env.ACCREDITATION_REPLY_TO_EMAIL = 'liv@aproposmagazine.com';
    expect(getAccreditationReplyTo('thread-xyz')).toBe('liv+thread-xyz@inbound.example.com');
    expect(getAccreditationMailIdentityPublic().replyToMode).toBe('plus_alias');
  });
});

describe('correlateInboundToThread Re/Fwd + request id', () => {
  it('normalizes Re:/Fwd:/SV: prefixes', () => {
    expect(normalizeSubjectForMatch('Re: Fwd: SV: Presseakkreditering')).toBe(
      'Presseakkreditering'
    );
    expect(extractRequestIdFromText('Re: Presseakkreditering [LIV-012]')).toBe('LIV-012');
    expect(extractRequestIdFromText('Fwd: LIV-045 follow-up')).toBe('LIV-045');
  });

  it('correlates by bracket request id when headers are stripped', async () => {
    const thread: AccreditationEmailThread = {
      id: 'thread-corr-1',
      requestId: 'LIV-012',
      contactEmail: 'presse@venue.dk',
      subject: 'Presseakkreditering [LIV-012]',
      status: 'awaiting_reply',
      messages: [
        {
          id: 'm1',
          direction: 'outbound',
          from: 'Liv Brandt <liv@aproposmagazine.com>',
          to: 'presse@venue.dk',
          subject: 'Presseakkreditering [LIV-012]',
          sentAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const request: AccreditationRequest = {
      id: 'LIV-012',
      artist: 'Test Artist',
      applicants: [{ name: 'Writer' }],
      accessRequested: 'presse',
      senderMailbox: 'liv@aproposmagazine.com',
      status: 'sent_awaiting_reply',
      threadId: 'thread-corr-1',
      contactEmail: 'presse@venue.dk',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeEmailThreads([thread]);
    await writeRequests([request]);

    const found = await correlateInboundToThread({
      fromEmail: 'presse@venue.dk',
      toAddresses: ['liv@aproposmagazine.com'],
      subject: 'Re: Presseakkreditering [LIV-012]',
      text: 'I er godkendt',
      headers: {},
    });
    expect(found?.id).toBe('thread-corr-1');

    const fwd = await correlateInboundToThread({
      fromEmail: 'presse@venue.dk',
      toAddresses: ['liv@aproposmagazine.com'],
      subject: 'Fwd: VS: Akkreditering LIV-012',
      text: 'forwarded',
      headers: {},
    });
    expect(fwd?.id).toBe('thread-corr-1');
  });
});

describe('persistent memory architecture', () => {
  it('loads contact profile + compact summary before reply and updates after events', async () => {
    await updateMemoryAfterEvent({
      requestId: 'LIV-200',
      threadId: 't-mem',
      contactEmail: 'promoter@example.com',
      contactName: 'Promoter',
      direction: 'outbound',
      blurb: 'Sendte akkrediteringsanmodning [LIV-200]',
    });
    await updateMemoryAfterEvent({
      requestId: 'LIV-200',
      threadId: 't-mem',
      contactEmail: 'promoter@example.com',
      direction: 'inbound',
      blurb: 'Svarede med godkendelse',
    });

    const block = await loadMemoryForReply({
      requestId: 'LIV-200',
      contactEmail: 'promoter@example.com',
    });
    expect(block).toContain('Kontaktprofil');
    expect(block).toContain('promoter@example.com');
    expect(block).toContain('Samtale-resume');
    expect(block).toContain('Ud:');
    expect(block).toContain('Ind:');
    expect(block).not.toMatch(/password|imap/i);
    expect(containsForbiddenDash(block)).toBe(false);
  });
});
