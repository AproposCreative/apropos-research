import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), queue: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({ path, get: async () => ({ data: () => state.rows.get(path) }),
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }) });
  return { getAdminDb: () => ({ collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (fn: any) => {
      const task = state.queue.catch(() => {}).then(() => fn({ get: (r: any) => r.get(),
        set: (r: any, value: any) => state.rows.set(r.path, value),
        create: (r: any, value: any) => { if (state.rows.has(r.path)) throw Error('exists'); state.rows.set(r.path, value); },
      })); state.queue = task; return task;
    },
  }) };
});
import { providerHoldId, readProviderHold, resumeProvider } from '@/lib/ai/provider-hold';
beforeEach(() => { state.rows.clear(); state.queue = Promise.resolve(); vi.stubEnv('OPENAI_API_KEY', 'test-only'); });
afterEach(() => vi.unstubAllEnvs());
it('never exposes the credential or receipt details and isolates changed keys', async () => {
  const id = providerHoldId(); expect(id).not.toContain('test-only');
  state.rows.set(`aiProviderHolds/${id}`, { blocked: true, revision: 1, blockedAt: 'today', callId: 'private-receipt' });
  expect(await readProviderHold()).toEqual({ blocked: true, revision: 1, blockedAt: 'today', reason: 'quota_exhausted' });
  vi.stubEnv('OPENAI_API_KEY', 'different-test'); expect((await readProviderHold()).blocked).toBe(false);
});
it('resumes exactly one revision, retains evidence and writes an audit without resetting any ledger', async () => {
  const path = `aiProviderHolds/${providerHoldId()}`;
  state.rows.set(path, { blocked: true, revision: 4, callId: 'receipt', blockedAt: 'yesterday' });
  state.rows.set('ledger', { committed: 100, reserved: 20 });
  const results = await Promise.allSettled([resumeProvider(4, 'owner'), resumeProvider(4, 'owner')]);
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
  expect(state.rows.get(path)).toMatchObject({ blocked: false, revision: 5, callId: 'receipt', blockedAt: 'yesterday' });
  expect(state.rows.get(`${path}/resumptions/4`)).toMatchObject({ userId: 'owner', expectedRevision: 4 });
  expect(state.rows.get('ledger')).toEqual({ committed: 100, reserved: 20 });
});
