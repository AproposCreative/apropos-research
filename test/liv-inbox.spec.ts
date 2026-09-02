import { beforeEach, describe, expect, it } from 'vitest';
import { resetAllAccreditationStoresForTests } from '@/lib/accreditation/persistence/test-reset';
import {
  DEFAULT_SETTINGS,
  getLivInboxSettings,
  updateLivInboxSettings,
} from '@/lib/liv-inbox/settings-store';
import { createInboxItem, listInboxItems, updateInboxItem } from '@/lib/liv-inbox/inbox-store';
import { fallbackDecision } from '@/lib/liv-inbox/assistant';
import { processInboundEmail, resolveInboxStatus } from '@/lib/liv-inbox/process';
import { ingestFetchedMessages, type FetchedMessage } from '@/lib/liv-inbox/imap-sync';
import type { LivInboxSettings } from '@/lib/liv-inbox/types';

function fakeMessage(uid: number, over: Partial<FetchedMessage['parsed']>): FetchedMessage {
  return {
    uid,
    parsed: {
      messageId: `<msg-${uid}@one.com>`,
      references: [],
      fromEmail: 'someone@x.dk',
      toAddresses: ['liv@aproposmagazine.com'],
      subject: 'Hej',
      text: 'Hej Liv',
      headers: {},
      ...over,
    },
  };
}

beforeEach(async () => {
  await resetAllAccreditationStoresForTests();
});

const baseSettings: LivInboxSettings = {
  ...DEFAULT_SETTINGS,
  autoRespond: false,
  confidenceThreshold: 40,
};

describe('liv-inbox settings store', () => {
  it('returns fail-closed defaults (auto-respond OFF)', async () => {
    const s = await getLivInboxSettings();
    expect(s.autoRespond).toBe(false);
    expect(s.guidelines).toContain('Sådan behandler vi normalt');
  });

  it('persists auto-respond and guideline updates', async () => {
    await updateLivInboxSettings({ autoRespond: true, guidelines: 'Svar altid venligt.' });
    const s = await getLivInboxSettings();
    expect(s.autoRespond).toBe(true);
    expect(s.guidelines).toBe('Svar altid venligt.');
  });

  it('clamps the confidence threshold to 0-100', async () => {
    const s = await updateLivInboxSettings({ confidenceThreshold: 250 });
    expect(s.confidenceThreshold).toBe(100);
  });
});

describe('liv-inbox item store', () => {
  it('creates, lists (newest first) and updates items', async () => {
    await createInboxItem({
      fromEmail: 'a@x.dk',
      subject: 'Først',
      body: 'Hej',
      receivedAt: '2026-01-01T00:00:00.000Z',
      status: 'draft',
    });
    await createInboxItem({
      fromEmail: 'b@x.dk',
      subject: 'Sidst',
      body: 'Hej',
      receivedAt: '2026-02-01T00:00:00.000Z',
      status: 'draft',
    });
    const items = await listInboxItems();
    expect(items).toHaveLength(2);
    expect(items[0].subject).toBe('Sidst');

    const updated = await updateInboxItem(items[0].id, { status: 'sent' });
    expect(updated?.status).toBe('sent');
  });
});

describe('resolveInboxStatus policy', () => {
  it('escalates when Liv is in doubt', () => {
    expect(resolveInboxStatus(baseSettings, { needsHuman: true, confidence: 95 })).toBe('escalated');
  });
  it('escalates when confidence is below the threshold', () => {
    expect(resolveInboxStatus(baseSettings, { needsHuman: false, confidence: 30 })).toBe('escalated');
  });
  it('auto-replies when confident and auto-respond is ON', () => {
    expect(
      resolveInboxStatus({ ...baseSettings, autoRespond: true }, { needsHuman: false, confidence: 90 })
    ).toBe('auto_replied');
  });
  it('drafts when confident but auto-respond is OFF', () => {
    expect(
      resolveInboxStatus({ ...baseSettings, autoRespond: false }, { needsHuman: false, confidence: 90 })
    ).toBe('draft');
  });
});

describe('fallbackDecision (no OpenAI key)', () => {
  it('escalates on sensitive content (payment/legal)', () => {
    const d = fallbackDecision(baseSettings, {
      fromEmail: 'x@y.dk',
      subject: 'Faktura',
      body: 'Kan I betale denne faktura og underskrive kontrakten?',
    });
    expect(d.needsHuman).toBe(true);
    expect(d.usedFallback).toBe(true);
  });

  it('drafts a warm holding reply for ordinary mail (no forbidden dashes)', () => {
    const d = fallbackDecision(baseSettings, {
      fromEmail: 'reader@x.dk',
      fromName: 'Ida',
      subject: 'Tak',
      body: 'Jeg elsker jeres magasin!',
    });
    expect(d.needsHuman).toBe(false);
    expect(d.reply).toContain('Ida');
    expect(d.reply).not.toContain('\u2014');
    expect(d.reply).not.toContain('\u2013');
  });
});

describe('processInboundEmail end-to-end (memory backend, fallback path)', () => {
  it('escalates a sensitive inquiry regardless of auto-respond', async () => {
    await updateLivInboxSettings({ autoRespond: true, confidenceThreshold: 40 });
    const item = await processInboundEmail({
      fromEmail: 'promoter@venue.dk',
      subject: 'Betaling',
      body: 'Send os venligst en faktura for samarbejdet.',
    });
    expect(item.status).toBe('escalated');
    expect(item.needsHuman).toBe(true);
    expect((await listInboxItems())).toHaveLength(1);
  });

  it('auto-replies an ordinary inquiry when auto-respond is ON and confident enough', async () => {
    await updateLivInboxSettings({ autoRespond: true, confidenceThreshold: 40 });
    const item = await processInboundEmail({
      fromEmail: 'reader@x.dk',
      subject: 'Hej Liv',
      body: 'Tak for et fantastisk magasin, bare ros herfra.',
    });
    expect(item.status).toBe('auto_replied');
    expect(item.handledAt).toBeTruthy();
    expect(item.draftReply).toBeTruthy();
  });

  it('drafts (does not auto-send) when auto-respond is OFF', async () => {
    await updateLivInboxSettings({ autoRespond: false, confidenceThreshold: 40 });
    const item = await processInboundEmail({
      fromEmail: 'reader@x.dk',
      subject: 'Hej Liv',
      body: 'Tak for et fantastisk magasin, bare ros herfra.',
    });
    expect(item.status).toBe('draft');
  });
});

describe('ingestFetchedMessages (one.com IMAP intake)', () => {
  it('triages fetched mail and de-duplicates by Message-ID', async () => {
    await updateLivInboxSettings({ autoRespond: false, confidenceThreshold: 40 });
    const messages: FetchedMessage[] = [
      fakeMessage(101, {
        fromEmail: 'ida@laeser.dk',
        subject: 'Ros',
        text: 'Elsker jeres magasin!',
      }),
      fakeMessage(102, {
        fromEmail: 'promoter@venue.dk',
        subject: 'Faktura',
        text: 'Kan I betale denne faktura og underskrive kontrakten?',
      }),
    ];

    const first = await ingestFetchedMessages(messages);
    expect(first.processed).toBe(2);
    const items = await listInboxItems();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.source === 'imap')).toBe(true);
    // Sensitive one escalates; ordinary one becomes a draft.
    expect(items.find((i) => i.fromEmail === 'promoter@venue.dk')?.status).toBe('escalated');
    expect(items.find((i) => i.fromEmail === 'ida@laeser.dk')?.status).toBe('draft');

    // Re-syncing the same messages must not create duplicates.
    const second = await ingestFetchedMessages(messages);
    expect(second.processed).toBe(0);
    expect(second.skipped).toBe(2);
    expect(await listInboxItems()).toHaveLength(2);
  });

  it('skips messages with no sender or empty body', async () => {
    const res = await ingestFetchedMessages([
      fakeMessage(201, { fromEmail: '', text: 'Har ingen afsender' }),
      fakeMessage(202, { fromEmail: 'x@y.dk', text: '   ' }),
    ]);
    expect(res.processed).toBe(0);
    expect(res.skipped).toBe(2);
    expect(await listInboxItems()).toHaveLength(0);
  });
});
