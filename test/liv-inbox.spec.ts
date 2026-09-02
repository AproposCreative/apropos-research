import { beforeEach, describe, expect, it } from 'vitest';
import { resetAllAccreditationStoresForTests } from '@/lib/accreditation/persistence/test-reset';
import { __setMemoryBackendForTests } from '@/lib/accreditation/memory-store';
import { createInMemoryMemoryBackend } from '@/lib/accreditation/memory-json-adapter';
import { gatherSenderIntelligence, __resetLivInboxContactCache } from '@/lib/liv-inbox/context';
import { appendLivInboxAudit, listLivInboxAudit } from '@/lib/liv-inbox/audit-store';
import {
  isLivInboxSendingEnabled,
  livInboxMailTransport,
  livInboxMaxAutoSendPerRun,
  resolveLivInboxRecipient,
  sendLivInboxReply,
} from '@/lib/liv-inbox/send';
import {
  DEFAULT_SETTINGS,
  getLivInboxSettings,
  updateLivInboxSettings,
} from '@/lib/liv-inbox/settings-store';
import { createInboxItem, listInboxItems, updateInboxItem } from '@/lib/liv-inbox/inbox-store';
import { fallbackDecision, isTwoLaneEnabled } from '@/lib/liv-inbox/assistant';
import { isMeaningfulEdit, mergeNote, learnFromEdit } from '@/lib/liv-inbox/learn';
import { buildThreadContext, correlateInboundToLivItem } from '@/lib/liv-inbox/correlate';
import { loadEditorialContext, __resetEditorialCacheForTests } from '@/lib/liv-inbox/editorial';
import { assessLivAttachments, toAttachmentMeta } from '@/lib/liv-inbox/attachments';
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
  __setMemoryBackendForTests('memory', createInMemoryMemoryBackend());
  __resetLivInboxContactCache();
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
    expect(s.guidelines).toContain('APROPOS-INDBAKKEN');
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

describe('sender intelligence (research + memory)', () => {
  it('treats an unseen sender as a new contact', async () => {
    const intel = await gatherSenderIntelligence('unknown@z.dk');
    expect(intel.known).toBe(false);
    expect(intel.priorInteractions).toBe(0);
    expect(intel.note).toBe('Ny kontakt');
  });

  it('learns a contact and recognises them on the next email', async () => {
    await updateLivInboxSettings({ autoRespond: true, confidenceThreshold: 40 });

    const first = await processInboundEmail({
      fromEmail: 'anders@label.dk',
      fromName: 'Anders',
      subject: 'Interviewtilbud',
      body: 'Vi vil gerne tilbyde jer et interview med kunstneren.',
    });
    expect(first.contactKnown).toBe(false); // researched before she was recorded

    const second = await processInboundEmail({
      fromEmail: 'anders@label.dk',
      fromName: 'Anders',
      subject: 'Opfølgning',
      body: 'Har I haft tid til at kigge på det?',
    });
    expect(second.contactKnown).toBe(true);
    expect(second.priorInteractions).toBeGreaterThan(0);
    expect(second.contactNote).toContain('Kendt kontakt');

    // The research block for this contact now carries prior context.
    const intel = await gatherSenderIntelligence('anders@label.dk');
    expect(intel.block).toContain('anders@label.dk');
  });

  it('remembers a sender even when the mail was escalated', async () => {
    await processInboundEmail({
      fromEmail: 'okonomi@bureau.dk',
      subject: 'Faktura',
      body: 'Kan I betale den vedhæftede faktura?',
    });
    const intel = await gatherSenderIntelligence('okonomi@bureau.dk');
    expect(intel.known).toBe(true);
  });
});

describe('audit trail', () => {
  it('records newest-first events', async () => {
    await appendLivInboxAudit({ type: 'poll', detail: 'first' });
    await appendLivInboxAudit({ type: 'sent', detail: 'second' });
    const events = await listLivInboxAudit();
    expect(events).toHaveLength(2);
    expect(events[0].detail).toBe('second');
    expect(events[0].id).toBeTruthy();
    expect(events[0].at).toBeTruthy();
  });

  it('logs an escalation audit event when Liv escalates a sensitive mail', async () => {
    await processInboundEmail({
      fromEmail: 'jura@firma.dk',
      subject: 'Kontrakt',
      body: 'Underskriv venligst vedhæftede NDA og kontrakt.',
    });
    const events = await listLivInboxAudit();
    expect(events.some((e) => e.type === 'escalated')).toBe(true);
  });

  it('logs a triage audit event for an ordinary mail', async () => {
    await updateLivInboxSettings({ autoRespond: false, confidenceThreshold: 40 });
    await processInboundEmail({
      fromEmail: 'reader@x.dk',
      subject: 'Ros',
      body: 'Fantastisk magasin!',
    });
    const events = await listLivInboxAudit();
    expect(events.some((e) => e.type === 'drafted' || e.type === 'auto_prepared')).toBe(true);
  });
});

describe('outbound safety gates (fail-closed)', () => {
  it('sending is disabled (shadow-mode) by default', () => {
    expect(isLivInboxSendingEnabled()).toBe(false);
  });

  it('blocks a send while the kill-switch is off', async () => {
    const r = await sendLivInboxReply({ itemId: 'i1', to: 'x@y.dk', subject: 'Hej', text: 'hej' });
    expect(r.sent).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.reason || '').toMatch(/SENDING_ENABLED|skygge/i);
  });

  it('does not auto-send even with auto-respond ON while the kill-switch is off', async () => {
    await updateLivInboxSettings({ autoRespond: true, confidenceThreshold: 40 });
    const item = await processInboundEmail({
      fromEmail: 'reader@x.dk',
      subject: 'Ros',
      body: 'Fantastisk magasin!',
    });
    expect(item.status).toBe('auto_replied');
    expect(item.sent).toBeFalsy(); // shadow: prepared but never sent
  });

  it('reads the per-run auto-send cap from env', () => {
    process.env.LIV_INBOX_MAX_AUTOSEND_PER_RUN = '2';
    try {
      expect(livInboxMaxAutoSendPerRun()).toBe(2);
    } finally {
      delete process.env.LIV_INBOX_MAX_AUTOSEND_PER_RUN;
    }
  });
});

describe('recipient routing (domain allowlist vs test-redirect)', () => {
  it('redirects a non-allowed recipient to the test sink', () => {
    process.env.LIV_INBOX_TEST_REDIRECT_TO = 'sink@test.dev';
    try {
      const r = resolveLivInboxRecipient('someone@external.com');
      expect(r.blocked).toBe(false);
      expect(r.redirected).toBe(true);
      expect(r.to).toBe('sink@test.dev');
    } finally {
      delete process.env.LIV_INBOX_TEST_REDIRECT_TO;
    }
  });

  it('sends real (no redirect) to an allowlisted internal domain', () => {
    process.env.LIV_INBOX_TEST_REDIRECT_TO = 'sink@test.dev';
    process.env.LIV_INBOX_ALLOWED_DOMAINS = 'aproposmagazine.com';
    try {
      const r = resolveLivInboxRecipient('kollega@aproposmagazine.com');
      expect(r.blocked).toBe(false);
      expect(r.redirected).toBe(false);
      expect(r.to).toBe('kollega@aproposmagazine.com');
    } finally {
      delete process.env.LIV_INBOX_TEST_REDIRECT_TO;
      delete process.env.LIV_INBOX_ALLOWED_DOMAINS;
    }
  });

  it('blocks fail-closed when no redirect and not allowlisted', () => {
    const r = resolveLivInboxRecipient('someone@external.com');
    expect(r.blocked).toBe(true);
  });
});

describe('attachment handling', () => {
  it('forces escalation for invoice/contract-like attachments', () => {
    const a = assessLivAttachments([{ filename: 'Faktura-4471.pdf', contentType: 'application/pdf', size: 51200 }]);
    expect(a.forceEscalate).toBe(true);
    expect(a.note).toContain('Faktura');
    expect(a.summaries[0]).toContain('faktura');
  });

  it('notes press kits and images without escalating', () => {
    const pk = assessLivAttachments([{ filename: 'presskit_band.pdf' }]);
    expect(pk.forceEscalate).toBe(false);
    expect(pk.note).toContain('Pressekit');
    const img = assessLivAttachments([{ filename: 'photo1.jpg' }, { filename: 'photo2.png' }]);
    expect(img.forceEscalate).toBe(false);
    expect(img.note).toContain('Billeder');
  });

  it('returns neutral assessment when there are no attachments', () => {
    expect(assessLivAttachments()).toEqual({ summaries: [], forceEscalate: false });
  });

  it('toAttachmentMeta drops buffers but keeps size', () => {
    const meta = toAttachmentMeta([
      { filename: 'a.pdf', contentType: 'application/pdf', content: Buffer.from('hello') },
      { filename: undefined, contentType: undefined },
    ]);
    expect(meta).toHaveLength(1);
    expect(meta[0]).toMatchObject({ filename: 'a.pdf', size: 5 });
  });

  it('an invoice attachment escalates via the deterministic fallback', () => {
    const decision = fallbackDecision(DEFAULT_SETTINGS, {
      fromEmail: 'x@y.dk',
      subject: 'Hej',
      body: 'Se vedhæftning',
      attachments: [{ filename: 'invoice_88.pdf' }],
    });
    expect(decision.needsHuman).toBe(true);
  });

  it('keeps an attachment-only IMAP message instead of dropping it', async () => {
    const summary = await ingestFetchedMessages([
      fakeMessage(701, {
        messageId: '<att-only@x.dk>',
        text: '',
        fromEmail: 'sender@x.dk',
        attachments: [{ filename: 'faktura.pdf', contentType: 'application/pdf', content: Buffer.from('x') }],
      }),
    ]);
    expect(summary.processed).toBe(1);
    const items = await listInboxItems();
    const it = items.find((i) => i.sourceMessageId === '<att-only@x.dk>');
    expect(it?.attachments?.[0].filename).toBe('faktura.pdf');
    expect(it?.needsHuman).toBe(true);
  });
});

describe('two-lane routing flag', () => {
  it('defaults on and can be disabled via env', () => {
    const prev = process.env.LIV_INBOX_TWO_LANE;
    delete process.env.LIV_INBOX_TWO_LANE;
    expect(isTwoLaneEnabled()).toBe(true);
    process.env.LIV_INBOX_TWO_LANE = 'off';
    expect(isTwoLaneEnabled()).toBe(false);
    process.env.LIV_INBOX_TWO_LANE = 'false';
    expect(isTwoLaneEnabled()).toBe(false);
    process.env.LIV_INBOX_TWO_LANE = '';
    expect(isTwoLaneEnabled()).toBe(true);
    if (prev === undefined) delete process.env.LIV_INBOX_TWO_LANE;
    else process.env.LIV_INBOX_TWO_LANE = prev;
  });
});

describe('editorial facts grounding', () => {
  it('exposes editorialFacts in the prompt when set (best-effort digest)', async () => {
    __resetEditorialCacheForTests();
    await updateLivInboxSettings({ editorialFacts: 'Vi dækker Roskilde og Northside i 2026.' });
    const ctx = await loadEditorialContext();
    expect(ctx).toContain('REDAKTIONELLE FAKTA');
    expect(ctx).toContain('Roskilde');
  });

  it('returns empty context when nothing is configured', async () => {
    __resetEditorialCacheForTests();
    await updateLivInboxSettings({ editorialFacts: '' });
    const ctx = await loadEditorialContext();
    expect(ctx).toBe('');
  });
});

describe('conversation threading (correlate)', () => {
  const baseItem = (over: Partial<import('@/lib/liv-inbox/types').LivInboxItem>) => ({
    id: 'x',
    fromEmail: 'p@promo.dk',
    subject: 'Hej',
    body: 'body',
    receivedAt: new Date().toISOString(),
    status: 'draft' as const,
    ...over,
  });

  it('matches inbound In-Reply-To against a prior outbound Message-ID', () => {
    const items = [baseItem({ id: 'a', outboundMessageId: 'liv-reply-1@one.com', receivedAt: '2026-01-01' })];
    const parent = correlateInboundToLivItem({ inReplyTo: '<LIV-REPLY-1@one.com>' }, items);
    expect(parent?.id).toBe('a');
  });

  it('matches via References against the original inbound Message-ID', () => {
    const items = [baseItem({ id: 'b', sourceMessageId: 'orig-9@promo.dk' })];
    const parent = correlateInboundToLivItem({ references: ['<orig-9@promo.dk>'] }, items);
    expect(parent?.id).toBe('b');
  });

  it('matches via the X-Apropos-LivInbox-Item header', () => {
    const items = [baseItem({ id: 'c' })];
    const parent = correlateInboundToLivItem({ headers: { 'x-apropos-livinbox-item': 'c' } }, items);
    expect(parent?.id).toBe('c');
  });

  it('returns undefined when nothing matches', () => {
    const items = [baseItem({ id: 'd', outboundMessageId: 'z@one.com' })];
    expect(correlateInboundToLivItem({ inReplyTo: '<nope@x.dk>' }, items)).toBeUndefined();
  });

  it('buildThreadContext summarizes prior turns', () => {
    const block = buildThreadContext([
      baseItem({ id: 'a', subject: 'Festival', body: 'Vil I dække?', draftReply: 'Vi vender tilbage', receivedAt: '2026-01-01' }),
    ]);
    expect(block).toContain('TIDLIGERE I SAMTALEN');
    expect(block).toContain('Festival');
    expect(block).toContain('Livs svar');
  });

  it('inherits threadId/parentItemId when an inbound replies to a prior item', async () => {
    const a = await processInboundEmail(
      { fromEmail: 'promo@x.dk', fromName: 'Promo', subject: 'Koncert', body: 'Kommer I?' },
      { source: 'imap', sourceMessageId: 'orig-a@x.dk' }
    );
    expect(a.threadId).toBeTruthy();
    const b = await processInboundEmail(
      { fromEmail: 'promo@x.dk', fromName: 'Promo', subject: 'Re: Koncert', body: 'Hej igen?' },
      { source: 'imap', sourceMessageId: 'orig-b@x.dk', inReplyTo: 'orig-a@x.dk' }
    );
    expect(b.parentItemId).toBe(a.id);
    expect(b.threadId).toBe(a.threadId);
  });
});

describe('learn from edits (feedback loop)', () => {
  it('ignores trivial/identical edits', () => {
    expect(isMeaningfulEdit('Hej Ida\n\nTak.', 'Hej Ida\n\nTak.')).toBe(false);
    expect(isMeaningfulEdit('Hej Ida   \n\n  Tak.', 'Hej Ida\nTak.')).toBe(false);
    expect(isMeaningfulEdit('', 'noget')).toBe(false);
  });

  it('detects a meaningful edit', () => {
    expect(isMeaningfulEdit('Hej Ida, tak for mailen.', 'Hej Ida, mange tak - vi vender tilbage.')).toBe(true);
  });

  it('ignores signature-only changes when signature is provided', () => {
    const sig = 'Bedste hilsner\nLiv';
    expect(isMeaningfulEdit(`Hej\n\n${sig}`, `Hej\n\n${sig}`, sig)).toBe(false);
  });

  it('mergeNote appends, de-dupes and caps to newest', () => {
    const a = mergeNote('', 'vær kortere', 100);
    expect(a).toBe('- vær kortere');
    const b = mergeNote(a, 'vær kortere', 100); // duplicate
    expect(b).toBe(a);
    const c = mergeNote(a, 'brug fornavn', 100);
    expect(c).toContain('vær kortere');
    expect(c).toContain('brug fornavn');
    const capped = mergeNote('x'.repeat(90), 'en ny regel her', 20);
    expect(capped.length).toBeLessThanOrEqual(20);
    expect(capped).toContain('regel');
  });

  it('learnFromEdit is a no-op without an LLM (and never throws)', async () => {
    const res = await learnFromEdit({
      original: 'Hej Ida, tak.',
      edited: 'Hej Ida, mange tak - vi vender tilbage snarest.',
      contactEmail: 'ida@x.dk',
    });
    expect(res.learned).toBe(false);
  });

  it('persists editorNotes on settings', async () => {
    await updateLivInboxSettings({ editorNotes: '- vær kortere' });
    const s = await getLivInboxSettings();
    expect(s.editorNotes).toBe('- vær kortere');
  });
});

describe('mail transport selection', () => {
  it('falls back to Resend when SMTP auth is unavailable, and honours the override', () => {
    // No one.com SMTP creds in the test env -> Resend.
    expect(livInboxMailTransport()).toBe('resend');
    process.env.LIV_INBOX_MAIL_TRANSPORT = 'smtp';
    try {
      expect(livInboxMailTransport()).toBe('smtp');
    } finally {
      delete process.env.LIV_INBOX_MAIL_TRANSPORT;
    }
  });
});
