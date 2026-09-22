import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), queue: Promise.resolve() as Promise<unknown>, failures: 0 }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: () => ({ doc: (id: string) => ({ id, set: async (value: any) => {
    if (state.failures-- > 0) throw Error('persistence');
    state.rows.set(id, { ...state.rows.get(id), ...value });
  } }) }),
  runTransaction: (fn: any) => {
    const task = state.queue.catch(() => {}).then(() => fn({
      get: async (ref: any) => ({ data: () => state.rows.get(ref.id) }),
      set: (ref: any, value: any) => state.rows.set(ref.id, value),
    })); state.queue = task; return task;
  },
}) }));
import { savedResearch } from '@/lib/research/saved-research';
import { withLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const result = { contextText: 'source evidence', sources: [{ title: 'Source', url: 'https://example.com', source: 'Example', snippet: 'Evidence' }],
  debug: { provider: 'openai_responses' as const, fallbackUsed: false, latencyMs: 1, query: 'query', rawResultCount: 1, gateScore: 1, gateReasons: [] } };
const run = (call: () => Promise<typeof result>, runId = 'story-one', contentVersion?: string) =>
  withLivCostContext({ runId, stage: 'research', ...(contentVersion ? { contentVersion } : {}) }, () => savedResearch('same-query', call));
beforeEach(() => { state.rows.clear(); state.queue = Promise.resolve(); state.failures = 0; });
it('reuses saved discovery for the same story without buying again', async () => {
  const call = vi.fn().mockResolvedValue(result);
  expect(await run(call)).toEqual(result); expect(await run(call)).toEqual(result); expect(call).toHaveBeenCalledOnce();
});
it('keeps separate work and changed article versions isolated', async () => {
  const call = vi.fn().mockResolvedValue(result);
  await run(call); await run(call, 'story-two'); await run(call, 'story-one', 'a'.repeat(64));
  expect(call).toHaveBeenCalledTimes(3);
});
it('retains uncertain calls without buying them again', async () => {
  const call = vi.fn().mockRejectedValue(Error('timeout'));
  await expect(run(call)).rejects.toThrow('timeout');
  await expect(run(call)).rejects.toThrow('research_requires_reconciliation'); expect(call).toHaveBeenCalledOnce();
});
it('retries only a proven pretransport refusal', async () => {
  const call = vi.fn().mockRejectedValueOnce(new LivCostPretransportError('liv_cost_provider_quota_exhausted')).mockResolvedValue(result);
  await expect(run(call)).rejects.toThrow('quota_exhausted');
  expect(await run(call)).toEqual(result); expect(await run(call)).toEqual(result); expect(call).toHaveBeenCalledTimes(2);
});
it('serializes competing requests and allows reuse after the first finishes', async () => {
  let finish!: (value: typeof result) => void;
  const call = vi.fn(() => new Promise<typeof result>(resolve => { finish = resolve; }));
  const first = run(call); await vi.waitFor(() => expect(call).toHaveBeenCalledOnce());
  await expect(run(call)).rejects.toThrow('reconciliation'); finish(result); await first;
  expect(await run(call)).toEqual(result); expect(call).toHaveBeenCalledOnce();
});
it('retries persistence, never the paid search', async () => {
  state.failures = 2; const call = vi.fn().mockResolvedValue(result);
  expect(await run(call)).toEqual(result); expect(call).toHaveBeenCalledOnce();
});
it('does not accept malformed cached results or regenerate to hide them', async () => {
  const call = vi.fn().mockResolvedValue(result); await run(call);
  for (const row of state.rows.values()) row.result.sources = [{ url: 12 }];
  await expect(run(call)).rejects.toThrow('reconciliation'); expect(call).toHaveBeenCalledOnce();
});
it('does not share unscoped private requests', async () => {
  const call = vi.fn().mockResolvedValue(result);
  await savedResearch('query', call); await savedResearch('query', call);
  expect(call).toHaveBeenCalledTimes(2); expect(state.rows.size).toBe(0);
});
