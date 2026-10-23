import { expect, it } from 'vitest';
import { addLivCmsDrafts, projectLivWork } from '@/lib/liv/work-overview';

const text = { title: 'Christopher', content: '<p>En bevaret artikeltekst.</p>', author: 'Liv Brandt' };
const row = (id: string, data: Record<string, unknown>) => ({ id, data });
it('includes only genuine Liv submissions, including a reserve, not plans, published work or other writers', () => {
  const items = projectLivWork([
    row('a'.repeat(64), { livProduction: { kind: 'reserve', day: '2026-09-28' }, article: text,
      status: 'draft', revision: 5, updatedAt: '2026-10-23T12:00:00Z' }),
    row('b'.repeat(64), { livProduction: { kind: 'scheduled', day: '2026-10-18' }, article: { ...text, title: 'Walter' },
      status: 'draft', revision: 6, updatedAt: '2026-10-23T11:00:00Z' }),
    row('c'.repeat(64), { article: { ...text, title: 'Andet projekt' }, status: 'draft' }),
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
