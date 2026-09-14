import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { QualityJob } from '../../../lib/seo-engine/post-publish/jobs';
const m = vi.hoisted(() => ({ rows: new Map<string, any>(), db: vi.fn(), tail: Promise.resolve() as Promise<any> }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: m.db }));
import { admitArchiveReview } from '../../../lib/seo-engine/post-publish/archive-admission';
const job = (id = 'a'.repeat(64), patch = {}) => ({ id, source: 'recovery', ...patch }) as QualityJob;
const now = new Date('2026-09-14T12:00:00Z');
beforeEach(() => {
  m.rows.clear(); m.tail = Promise.resolve(); vi.clearAllMocks();
  m.db.mockReturnValue({ collection: (name: string) => ({ doc: (id: string) => `${name}/${id}` }),
    runTransaction: (fn: any) => {
      const result = m.tail.then(() => fn({
        getAll: async (...keys: string[]) => keys.map(k => ({ exists: m.rows.has(k), data: () => m.rows.get(k) })),
        create: (key: string, data: any) => { if (m.rows.has(key)) throw Error('duplicate'); m.rows.set(key, data); },
      })); m.tail = result.catch(() => {}); return result;
    } });
});
it('admits just one concurrent new archive job and replays its admission', async () => {
  expect(await Promise.all([admitArchiveReview(job(), now), admitArchiveReview(job('b'.repeat(64)), now)])).toEqual([true, false]);
  expect(await admitArchiveReview(job(), now)).toBe(true);
  expect(m.rows.size).toBe(2);
});
it('admits the next job on the next Copenhagen day', async () => {
  await admitArchiveReview(job(), now);
  expect(await admitArchiveReview(job('b'.repeat(64)), new Date('2026-09-14T22:01:00Z'))).toBe(true);
});
it.each(['started','responded','uncertain'])('retains prior %s paid-stage work when daily allowance is used', async status => {
  await admitArchiveReview(job(), now);
  const next = job('b'.repeat(64));
  const key = createHash('sha256').update(`${next.id}:review`).digest('hex');
  m.rows.set(`seoPostPublishModelStages/${key}`, { status });
  expect(await admitArchiveReview(next, now)).toBe(true);
});
it('does not treat a pre-transport denial as paid work', async () => {
  await admitArchiveReview(job(), now);
  const next = job('b'.repeat(64));
  m.rows.set('seoPostPublishModelStages/' + createHash('sha256').update(`${next.id}:review`).digest('hex'), { status: 'not_started' });
  expect(await admitArchiveReview(next, now)).toBe(false);
});
it.each([{ source: 'webhook' }, { source: 'publish_app' }, { writeStartedAt: now.toISOString() }])('does not throttle new publication or CMS reconciliation %j', async patch => {
  expect(await admitArchiveReview(job(undefined, patch), now)).toBe(true);
  expect(m.db).not.toHaveBeenCalled();
});
