import { beforeEach, expect, it, vi } from 'vitest';
import { qualityPriorityReadyAt } from '../../../lib/seo-engine/post-publish/priority';
const m = vi.hoisted(() => ({ rows: new Map<string, any>(), queries: [] as string[] }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (collection: string, id: string) => ({ key: `${collection}/${id}` });
  const snapshot = (r: any) => ({ exists: m.rows.has(r.key), data: () => m.rows.get(r.key) });
  const write = (r: any, value: any, merge = true) => {
    const next = { ...(merge ? m.rows.get(r.key) : {}), ...value };
    for (const key of Object.keys(next)) if (next[key] === '__DELETE__') delete next[key];
    m.rows.set(r.key, next);
  };
  return { getAdminDb: () => ({ collection: (collection: string) => ({
    doc: (id: string) => ref(collection, id),
    where: (field: string, _op: string, now: number) => ({ orderBy: () => ({ limit: (count: number) => ({ get: async () => {
      m.queries.push(field);
      return { docs: [...m.rows].filter(([key, v]) => key.startsWith(collection + '/') && typeof v[field] === 'number' && v[field] <= now)
        .sort((a, b) => a[1][field] - b[1][field]).slice(0, count).map(([key, v]) => ({ id: key.split('/')[1], data: () => v })) };
    } }) }) }),
  }), runTransaction: (fn: any) => fn({ get: async (r: any) => snapshot(r),
    create: (r: any, v: any) => write(r, v, false), set: (r: any, v: any, options: any) => write(r, v, options?.merge ?? false),
    update: (r: any, v: any) => write(r, v) }) }) };
});
import { claimQualityJob, checkpointQualityJob, listRecoverableQualityJobs, finishQualityJob } from '../../../lib/seo-engine/post-publish/jobs';
import type { QualityJob } from '../../../lib/seo-engine/post-publish/jobs';
const id = 'a'.repeat(64);
const key = `seoPostPublishJobs/${id}`;
beforeEach(() => { m.rows.clear(); m.queries.length = 0; });
it('selects a new publication ahead of hundreds of older archive jobs with bounded queries', async () => {
  for (let i = 0; i < 224; i++) m.rows.set(`seoPostPublishJobs/old-${i}`, { source: 'recovery', status: 'queued', readyAt: i });
  m.rows.set(key, { source: 'webhook', status: 'queued', readyAt: 500, priorityReadyAt: 500 });
  expect(await listRecoverableQualityJobs(2)).toEqual([id, 'old-0']);
  expect(m.queries).toEqual(['priorityReadyAt', 'readyAt']);
});
it('deduplicates jobs appearing in both lanes', async () => {
  m.rows.set(key, { status: 'queued', readyAt: 1, priorityReadyAt: 1 });
  expect(await listRecoverableQualityJobs(2)).toEqual([id]);
});
it('keeps priority in sync when claiming and deferring a publication', async () => {
  m.rows.set(key, { id, source: 'webhook', status: 'queued', readyAt: 1, priorityReadyAt: 1, attempt: 0 });
  const job = (await claimQualityJob(id))!;
  expect(m.rows.get(key).priorityReadyAt).toBe(job.readyAt);
  await checkpointQualityJob(job, { status: 'waiting_budget', readyAt: Date.now() + 10000 }, true);
  expect(m.rows.get(key).priorityReadyAt).toBe(m.rows.get(key).readyAt);
});
it('removes both scheduling fields on terminal checkpoints', async () => {
  const job = { id, owner: 'worker', source: 'webhook', status: 'running', leaseUntil: Date.now() + 10000,
    priorityReadyAt: 1, readyAt: 1 } as QualityJob;
  m.rows.set(key, job);
  await checkpointQualityJob(job, { status: 'failed' }, true);
  expect(m.rows.get(key).priorityReadyAt).toBeUndefined(); expect(m.rows.get(key).readyAt).toBeUndefined();
});
it('promotes uncertain archive writes but not untouched archive reviews', () => {
  expect(qualityPriorityReadyAt({ source: 'recovery', status: 'queued', readyAt: 100 })).toBeNull();
  expect(qualityPriorityReadyAt({ source: 'recovery', status: 'verify_pending', readyAt: 100, writeStartedAt: '2026-09-14' })).toBe(100);
  expect(qualityPriorityReadyAt({ source: 'webhook', status: 'applied', readyAt: 100 })).toBeNull();
});
it('removes both lane fields on successful completion', async () => {
  const job = { id, owner: 'worker', source: 'webhook', status: 'running', leaseUntil: Date.now() + 10000,
    priorityReadyAt: 1, readyAt: 1, snapshot: { itemId: 'item', locale: 'da', contentVersion: 'v1',
      metadata: { seoTitle: 'Title', metaDescription: 'Description' } } } as QualityJob;
  m.rows.set(key, job);
  await finishQualityJob(job, { status: 'kept' });
  expect(m.rows.get(key).priorityReadyAt).toBeUndefined(); expect(m.rows.get(key).readyAt).toBeUndefined();
});
