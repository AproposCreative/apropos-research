import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rows: new Map<string, any>(), reads: [] as string[] }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: (collection: string) => ({ doc: (id: string) => ({ path: `${collection}/${id}`,
    get: async () => { m.reads.push(`${collection}/${id}`); return { data: () => m.rows.get(`${collection}/${id}`) }; } }) }),
  getAll: async (...refs: Array<{ path: string }>) => refs.map(ref => { m.reads.push(ref.path); return { data: () => m.rows.get(ref.path) }; }),
}) }));
import { readCostPublications } from '@/lib/ai/cost-publications';
import type { CostAction } from '@/lib/ai/cost-actions';
const itemId = 'a'.repeat(24), hash = 'b'.repeat(64);
const action = { bucket: 'shared', scope: 'liv', runId: 'prepare-2026-09-28' } as CostAction;
const slot = { itemId, state: 'published', checkedAt: '2026-09-29T08:01:00Z', publicUrl: 'https://www.aproposmagazine.com/articles/article', fieldDataHash: hash };
beforeEach(() => { m.rows.clear(); m.reads = []; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  m.rows.set(`livDailyArticles/${action.runId}`, { webflowItemId: itemId, title: 'Gemte ord' });
});
afterEach(() => vi.useRealTimers());
it('reads archived receipts and explicitly links a run without changing anything', async () => {
  m.rows.set('livDelivery/receipt-2026-09-29', slot);
  expect(await readCostPublications([action], '2026-09')).toEqual([{ runId: action.runId, itemId, title: 'Gemte ord', state: 'published', checkedAt: slot.checkedAt }]);
  expect(m.rows.size).toBe(2);
});
it.each([{ state: 'attempted' }, { checkedAt: null }, { fieldDataHash: '' }, { publicUrl: 'https://example.com' }])('does not turn partial receipts into a publication: %j', async patch => {
  m.rows.set('livDelivery/manifest', { slots: { '2026-09-29': { ...slot, ...patch } } });
  expect((await readCostPublications([action], '2026-09'))[0].state).toBe('unfinished');
});
it('keeps ready, expired, rejected and blocked inventory distinct', async () => {
  const entry = { itemId, state: 'ready', expiresDay: '2026-10-05', preparedAt: '2026-10-01T00:00:00Z', payloadHash: hash };
  for (const [patch, expected] of [[{}, 'ready'], [{ expiresDay: '2026-10-01' }, 'unfinished'], [{ decision: 'rejected' }, 'unfinished'], [{ publicationBlockers: ['image'] }, 'unfinished']] as const) {
    m.rows.set('livDelivery/manifest', { entries: [{ ...entry, ...patch }] });
    expect((await readCostPublications([action], '2026-09'))[0].state).toBe(expected);
  }
});
it('does not infer a CMS identity from a run date or mix image-gen into Liv', async () => {
  m.rows.set(`livDailyArticles/${action.runId}`, { status: 'published', title: 'Not proof' });
  expect(await readCostPublications([action], '2026-09')).toEqual([]);
  m.reads = [];
  expect(await readCostPublications([{ ...action, bucket: 'image-gen' }], '2026-09')).toEqual([]);
  expect(m.reads).toEqual([]);
});
