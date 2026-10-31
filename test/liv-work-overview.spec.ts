import { expect, it } from 'vitest';
import { addLivCmsDrafts, partitionLivWork, projectLivWork, type LivWorkItem } from '@/lib/liv/work-overview';

const text = { title: 'Christopher', content: '<p>En bevaret artikeltekst.</p>', author: 'Liv Brandt' };
const row = (id: string, data: Record<string, unknown>) => ({ id, data });
it('retains old drafts in history while keeping recent, prepared, processing and future work visible', () => {
  const base: LivWorkItem = { id: 'old', title: 'Bevaret kladde', source: 'chatgpt-submission', cmsItemId: null,
    kind: 'scheduled', scheduledDay: null, revision: 3, updatedAt: '2026-10-06T12:00:00Z',
    researchCount: 7, status: 'draft', missing: ['cover'], previewUrl: '/connect/chatgpt?submission=old' };
  const saved = [base,
    { ...base, id: 'recent', updatedAt: '2026-10-30T12:00:00Z' },
    { ...base, id: 'prepared', status: 'prepared' as const },
    { ...base, id: 'processing', status: 'processing' as const },
    { ...base, id: 'future', scheduledDay: '2026-11-01' },
    { ...base, id: 'today', scheduledDay: '2026-10-31' }];
  const before = structuredClone(saved);
  const overview = partitionLivWork(saved, new Date('2026-10-30T23:30:00Z'));
  expect(overview.items.map(item => item.id)).toEqual(['recent', 'prepared', 'processing', 'future', 'today']);
  expect(overview.history).toEqual([base]);
  expect(saved).toEqual(before);
});
it('includes only genuine Liv submissions, including a reserve, not plans, published work or other writers', () => {
  const items = projectLivWork([
    row('a'.repeat(64), { livProduction: { kind: 'reserve', day: '2026-09-28' }, article: text,
      status: 'draft', revision: 5, updatedAt: '2026-10-23T12:00:00Z' }),
    row('b'.repeat(64), { livProduction: { kind: 'scheduled', day: '2026-10-18' }, article: { ...text, title: 'Walter' },
      status: 'draft', revision: 6, updatedAt: '2026-10-23T11:00:00Z' }),
    row('c'.repeat(64), { article: { ...text, title: 'Andet projekt', author: 'Frederik Kragh' }, status: 'draft' }),
    row('d'.repeat(64), { livProduction: { kind: 'scheduled', day: '2026-10-16' }, article: text, status: 'published' }),
  ], [row('prepare-2026-10-24', { title: 'Cardi B', articleCheckpoint: null, status: 'failed' })]);
  expect(items.map(item => item.title)).toEqual(['Christopher', 'Walter']);
  expect(items[0]).toMatchObject({ kind: 'reserve', scheduledDay: null, revision: 5, status: 'draft' });
  expect(items[1]).toMatchObject({ kind: 'scheduled', scheduledDay: '2026-10-18' });
  expect(items.every(item => item.previewUrl?.startsWith('/connect/chatgpt?submission='))).toBe(true);
});
it('shows an actual saved legacy article and deduplicates by a known CMS identity only', () => {
  const items = projectLivWork([
    row('a'.repeat(64), { livProduction: { kind: 'scheduled', day: '2026-10-18' }, article: text,
      prepared: { itemId: 'c'.repeat(24) }, status: 'draft' }),
  ], [
    row('prepare-2026-10-18', { articleCheckpoint: text, webflowItemId: 'c'.repeat(24) }),
    row('reserve-2026-10-20', { articleCheckpoint: { ...text, title: 'Anden reserve' }, status: 'failed' }),
  ]);
  expect(items.map(item => item.title)).toEqual(['Christopher', 'Anden reserve']);
  expect(items[1]).toMatchObject({ source: 'saved-checkpoint', kind: 'reserve', status: 'blocked' });
});
it('shows saved editorial-desk article text but not research-only ideas', () => {
  const items = projectLivWork([], [], [
    row('a'.repeat(64), { status: 'draft', article: { title: 'Kulturudkast', content: '<p>Faktisk tekst</p>', section: 'Kultur' } }),
    row('b'.repeat(64), { status: 'researched', signal: { title: 'Kun et emne' } }),
  ]);
  expect(items.map(item => item.title)).toEqual(['Kulturudkast']);
  expect(items[0]).toMatchObject({ source: 'editorial-desk', status: 'draft' });
});
it('adds only Liv CMS drafts and does not duplicate or resurrect published identities', () => {
  const cms = { items: [
    { id: '1'.repeat(24), fieldData: { name: 'Liv kladde', author: 'liv-id', content: '<p>Bevaret tekst</p>' }, isDraft: true },
    { id: '2'.repeat(24), fieldData: { name: 'Anden forfatter', author: 'other', content: '<p>Tekst</p>' }, isDraft: true },
    { id: '3'.repeat(24), fieldData: { name: 'Udgivet', author: 'liv-id', content: '<p>Tekst</p>' }, isDraft: false, lastPublished: '2026-10-22' },
    { id: '4'.repeat(24), fieldData: { name: 'Allerede gemt', author: 'liv-id', content: '<p>Tekst</p>' }, isDraft: true },
  ], rowsRead: 4, complete: true, maxRows: 300, sortedBy: 'lastUpdated_desc' as const };
  const known = projectLivWork([row('a'.repeat(64), { livProduction: { kind: 'reserve', day: '2026-09-28' },
    article: text, prepared: { itemId: '4'.repeat(24) }, status: 'draft' })], []);
  const result = addLivCmsDrafts(known, cms as any, ['liv-id'], new Set());
  expect(result.map(item => item.title).sort()).toEqual(['Christopher', 'Liv kladde']);
});
it('keeps stale legacy and CMS archive drafts out of active work while retaining saved ChatGPT submissions', () => {
  const since = '2026-10-09T00:00:00.000Z';
  const submissions = [row('a'.repeat(64), { livProduction: { kind: 'reserve', day: '2026-09-28' },
    article: text, status: 'draft', updatedAt: '2026-09-28T12:00:00Z' })];
  const runs = [row('prepare-2026-09-20', { articleCheckpoint: { ...text, title: 'Historisk run' }, updatedAt: '2026-09-20T12:00:00Z' })];
  const active = projectLivWork(submissions, runs, [], since);
  expect(active.map(item => item.title)).toEqual(['Christopher']);
  const cms = { items: [{ id: '1'.repeat(24), fieldData: { name: 'Gammel CMS-kladde', author: 'liv-id', content: '<p>Tekst</p>' },
    isDraft: true, lastUpdated: '2026-09-20T12:00:00Z' }], rowsRead: 1, complete: true, maxRows: 300, sortedBy: 'lastUpdated_desc' as const };
  expect(addLivCmsDrafts(active, cms as any, ['liv-id'], new Set(), since)).toHaveLength(1);
});


it('includes an explicitly Liv-authored museum guide even without a scheduled-production identity', () => {
  const rows = [row('9'.repeat(64), { status: 'awaiting_preparation', article: { ...text,
    title: 'På radaren: Fire & Ice på Copenhagen Contemporary', author: 'liv-id' }, choices: { kind: 'feature' } }),
    row('8'.repeat(64), { article: { ...text, title: 'En anden redaktørs arbejde', author: 'other-id' } })];
  const snapshot = structuredClone(rows);
  const result = projectLivWork(rows, [], [], '', ['liv-id']);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ id: '9'.repeat(64), editorialRemit: { eligible: true, format: 'culture-guide' }, scheduledDay: null });
  expect(rows).toEqual(snapshot);
});
