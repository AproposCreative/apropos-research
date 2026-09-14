import { beforeEach, expect, it, vi } from 'vitest';
const memory = vi.hoisted(() => ({ rows: new Map<string, any>(), tail: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (key: string): any => ({ key, collection: (name: string) => ({ doc: (id: string) => ref(`${key}/${name}/${id}`) }),
    get: async () => ({ data: () => structuredClone(memory.rows.get(key)) }) });
  return { getAdminDb: () => ({ collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (run: any) => {
      const task = memory.tail.then(async () => {
        const changes: Array<() => void> = [];
        const set = (r: any, row: any, options?: any) => changes.push(() => memory.rows.set(r.key,
          structuredClone(options?.merge ? { ...memory.rows.get(r.key), ...row } : row)));
        const result = await run({ get: async (r: any) => {
          if (changes.length) throw Error('read_after_write'); return r.get();
        }, set, create: set, update: (r: any, row: any) => set(r, row, { merge: true }) });
        changes.forEach(change => change()); return result;
      }); memory.tail = task.catch(() => undefined); return task;
    } }) };
});
import { claimImageGenJob, finishImageGenJob, readImageGenJob } from '@/lib/image-gen/jobs';
const input = { requestId: 'request-000000000001', articleId: 'a'.repeat(24), articleVersion: 'b'.repeat(64),
  operation: 'generate' as const, parameters: { motif: 'En abe på scenen' } };
beforeEach(() => { memory.rows.clear(); memory.tail = Promise.resolve(); });
it('claims only once across concurrent requests and reconnects', async () => {
  const claims = await Promise.all(Array.from({ length: 5 }, () => claimImageGenJob('frederik', input)));
  expect(claims.filter(c => c.created)).toHaveLength(1);
  expect(new Set(claims.map(c => c.job.id)).size).toBe(1);
  await finishImageGenJob('frederik', claims[0].job.id, { status: 'succeeded', result: { asset: 'saved' } });
  expect((await claimImageGenJob('frederik', input)).job.result).toEqual({ asset: 'saved' });
});
it('does not expose another UID job even with its ID and request key', async () => {
  const a = await claimImageGenJob('frederik', input);
  expect(await readImageGenJob('milo', a.job.id)).toBeNull();
  const b = await claimImageGenJob('milo', input); expect(b.job.id).not.toBe(a.job.id);
  await expect(finishImageGenJob('casper', a.job.id, { status: 'succeeded', result: {} })).rejects.toThrow('missing');
});
it('rejects changed intent with a reused request key and does not restart a timed-out job', async () => {
  const job = await claimImageGenJob('milo', input, 1);
  await expect(claimImageGenJob('milo', { ...input, parameters: { changed: true } })).rejects.toThrow('idempotency_conflict');
  expect((await claimImageGenJob('milo', input, 999999)).created).toBe(false);
  await expect(claimImageGenJob('milo', { ...input, requestId: 'request-000000000002' }, 999999)).rejects.toThrow('in_progress');
  expect((await readImageGenJob('milo', job.job.id))?.deadline).toBe(300001);
});
it('preserves uncertain outcomes and rejects overwriting a terminal result', async () => {
  const { job } = await claimImageGenJob('milo', input);
  await finishImageGenJob('milo', job.id, { status: 'uncertain', errorCode: 'provider_timeout' });
  expect((await claimImageGenJob('milo', input)).job.status).toBe('uncertain');
  await expect(finishImageGenJob('milo', job.id, { status: 'succeeded', result: 'invented' })).rejects.toThrow('conflict');
});
