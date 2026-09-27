import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { editorialPlanHash } from '@/lib/liv/rolling-plan';
const db = vi.hoisted(() => ({ rows: new Map<string, any>(), inspect: vi.fn(), queue: Promise.resolve() as Promise<unknown> }));
const ref = (path: string) => ({ path, get: async () => ({ data: () => structuredClone(db.rows.get(path)) }) });
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
  runTransaction: (fn: any) => {
    const task = db.queue.then(async () => {
      const writes: Array<() => void> = [];
      const result = await fn({ get: async (r: any) => {
        if (writes.length) throw Error('read_after_write');
        return { exists: db.rows.has(r.path), data: () => structuredClone(db.rows.get(r.path)) };
      }, set: (r: any, value: any) => writes.push(() => db.rows.set(r.path, value)),
      create: (r: any, value: any) => {
        if (db.rows.has(r.path)) throw Error('exists');
        writes.push(() => db.rows.set(r.path, value));
      } });
      writes.forEach(w => w()); return result;
    }); db.queue = task.catch(() => {}); return task;
  },
}) }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: db.inspect }));
import { scheduleReadyReserve } from '@/lib/liv/schedule-ready-reserve';
const day = '2026-09-28', itemId = 'a'.repeat(24), now = Date.parse('2026-09-27T10:00:00Z');
const payload = { title: 'Klar reserve', slug: 'klar-reserve', content: 'Uændret artikel' };
const payloadHash = cmsFieldHash(payload);
const state = () => db.rows.get('livDelivery/manifest');
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); db.rows.clear(); db.queue = Promise.resolve();
  db.inspect.mockReset().mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ ok: true }] });
  db.rows.set('livDelivery/manifest', { entries: [{ itemId, kind: 'reserve', state: 'ready',
    title: payload.title, slug: payload.slug, scheduledDay: '2026-09-26', expiresDay: '2026-10-01',
    payloadHash, preparedAt: '2026-09-26T12:00:00Z' }],
    slots: { '2026-09-27': { itemId: 'previous', state: 'published' } }, preparation: { token: 'lease', leaseUntil: now + 300000 } });
  db.rows.set(`livDelivery/item-${itemId}`, { expected: payload, payloadHash });
  db.rows.set(`livDailyPlan/plan-${day}`, { dayKey: day, topicHint: 'Original plan', status: 'failed' });
  db.rows.set(`livDailyArticles/prepare-${day}`, { status: 'failed', reason: 'source_similarity_unapproved' });
  db.rows.set(`livDailyArticles/prepare-alternative-${day}`, { status: 'failed', reason: 'source_similarity_incomplete' });
});
afterEach(() => vi.useRealTimers());
it('assigns an unchanged verified reserve once and retains paid failures and proof', async () => {
  const before = structuredClone(db.rows);
  const results = await Promise.all([scheduleReadyReserve('lease', now), scheduleReadyReserve('lease', now)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(state().entries[0]).toMatchObject({ kind: 'scheduled', scheduledDay: day, payloadHash,
    planHash: editorialPlanHash(db.rows.get(`livDailyPlan/plan-${day}`)) });
  expect(db.rows.get(`livDelivery/item-${itemId}`)).toEqual(before.get(`livDelivery/item-${itemId}`));
  expect(db.rows.get(`livDailyArticles/prepare-${day}`)).toEqual(before.get(`livDailyArticles/prepare-${day}`));
  expect(db.rows.get(`livReserveAssignments/${day}-${itemId}`).previous.kind).toBe('reserve');
  expect(await scheduleReadyReserve('lease', now)).toBeNull();
});
it.each(['quota', 'unknown-provider', 'cms', 'rejected', 'expired', 'cover', 'selected', 'failed-readback', 'changed-payload', 'active-primary'])(
  'does not assign past %s', async mode => {
    if (mode === 'quota') db.rows.get(`livDailyArticles/prepare-${day}`).reason = 'liv_cost_provider_quota_exhausted';
    if (mode === 'unknown-provider') db.rows.get(`livDailyArticles/prepare-${day}`).reason = 'Request timed out.';
    if (mode === 'cms') state().slots['2026-09-27'].state = 'attempted';
    if (mode === 'rejected') state().entries[0].decision = 'rejected';
    if (mode === 'expired') state().entries[0].expiresDay = '2026-09-27';
    if (mode === 'cover') state().coverRevision = { id: 'hold' };
    if (mode === 'selected') state().entries[0].state = 'selected';
    if (mode === 'failed-readback') db.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: false, checks: [{ ok: false }] });
    if (mode === 'changed-payload') db.rows.get(`livDelivery/item-${itemId}`).expected = { ...payload, content: 'Changed' };
    if (mode === 'active-primary') db.rows.set(`livDailyArticles/prepare-${day}`, { status: 'processing', continuationReady: false });
    const before = JSON.stringify([...db.rows]);
    if (mode === 'changed-payload') await expect(scheduleReadyReserve('lease', now)).rejects.toThrow('payload_changed');
    else expect(await scheduleReadyReserve('lease', now)).toBeNull();
    expect(JSON.stringify([...db.rows])).toBe(before);
  });
it('rejects a lost lease', async () => {
  await expect(scheduleReadyReserve('old-lease', now)).rejects.toThrow('lease_lost');
});
it('does not assign a reserve rejected while CMS readback is running', async () => {
  db.inspect.mockImplementation(async () => {
    state().entries[0].decision = 'rejected';
    return { draftConfirmed: true, publicationReady: true, checks: [{ ok: true }] };
  });
  expect(await scheduleReadyReserve('lease', now)).toBeNull();
  expect(state().entries[0].kind).toBe('reserve');
});
