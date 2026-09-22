import { describe, expect, it, vi } from 'vitest';
import { durableReviewModel, modelRequestHash, type ModelStageStore, type ModelStageRecord } from '../../../lib/seo-engine/post-publish/durable-model';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';

function memoryStore(): ModelStageStore {
  const records = new Map<string, ModelStageRecord>();
  return { async transact(key, fn) {
    const mutation = fn(records.get(key) ?? null);
    if (mutation.next) records.set(key, mutation.next);
    return mutation.result;
  } };
}
const request = { stage: 'review' as const, system: 'review', input: 'article' };

describe('durable model stages', () => {
  it('recovers a competing job from the completed shared receipt without repurchase', async () => {
    let finish!: (value: string) => void;
    const call = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const args = { jobId: 'first', model: 'model', store: memoryStore(), call, reuseAcrossJobs: true };
    const first = durableReviewModel(args)(request);
    await vi.waitFor(() => expect(call).toHaveBeenCalledOnce());
    const second = durableReviewModel({ ...args, jobId: 'second' });
    await expect(second(request)).rejects.toThrow('requires_reconciliation');
    finish('saved'); expect(await first).toBe('saved');
    expect(await second(request)).toBe('saved'); expect(call).toHaveBeenCalledOnce();
  });
  it('reuses identical requests across distinct jobs, never changed content',async()=>{
    const store=memoryStore(),call=vi.fn().mockResolvedValue('saved');
    const args={jobId:'job1',model:'model',store,call,reuseAcrossJobs:true};
    expect(await durableReviewModel(args)(request)).toBe('saved');
    expect(await durableReviewModel({...args,jobId:'job2'})(request)).toBe('saved');
    expect(call).toHaveBeenCalledOnce();
    await durableReviewModel({...args,jobId:'job3'})({...request,input:'changed facts'});
    expect(call).toHaveBeenCalledTimes(2);
  });
  it.each([{ response: 'paid output' }, { response: '' }, { respondedAt: '2026-09-13T12:00:00Z' }])('never retries malformed not_started records with response evidence: %j', async evidence => {
    const current: ModelStageRecord = { requestHash: modelRequestHash(request, 'model'), owner: 'old', status: 'not_started',
      startedAt: '2026-09-13T11:00:00Z', notStartedReason: 'cost_denied', ...evidence,
      costDenials: [{ owner: 'old', startedAt: '2026-09-13T11:00:00Z', recordedAt: '2026-09-13T11:01:00Z', code: 'liv_cost_monthly_budget_exceeded', providerAttempted: false }] };
    const call = vi.fn();
    const store: ModelStageStore = { async transact(_key, fn) { return fn(current).result; } };
    await expect(durableReviewModel({ jobId: 'job1', model: 'model', store, call })(request)).rejects.toThrow('requires_reconciliation');
    expect(call).not.toHaveBeenCalled();
  });
  it('records branded SDK-wrapped cost denial as not_started and permits a fresh budget-checked attempt', async () => {
    const records: ModelStageRecord[] = [];
    const backing = memoryStore();
    const store: ModelStageStore = { transact: (key, fn) => backing.transact(key, current => {
      const mutation = fn(current); if (mutation.next) records.push(structuredClone(mutation.next)); return mutation;
    }) };
    const call = vi.fn().mockRejectedValueOnce(new Error('SDK connection error', { cause: new LivCostPretransportError('liv_cost_monthly_budget_exceeded') }))
      .mockResolvedValue('saved');
    const args = { jobId: 'job1', model: 'model', store, call };
    await expect(durableReviewModel(args)(request)).rejects.toThrow('SDK connection');
    expect(records.at(-1)).toMatchObject({ status: 'not_started', notStartedReason: 'cost_denied',
      costDenials: [{ code: 'liv_cost_monthly_budget_exceeded', providerAttempted: false }] });
    await expect(durableReviewModel(args)({ ...request, input: 'changed' })).rejects.toThrow('request_changed');
    expect(await durableReviewModel(args)(request)).toBe('saved');
    expect(await durableReviewModel(args)(request)).toBe('saved');
    expect(call).toHaveBeenCalledTimes(2);
    expect(records.at(-1)?.costDenials).toEqual(records[1].costDenials);
  });
  it.each([
    new Error('liv_cost_monthly_budget_exceeded'),
    new Error('network', { cause: { name: 'LivCostPretransportError', code: 'liv_cost_monthly_budget_exceeded', providerAttempted: false } }),
    new Error('reservation commit outcome unknown'),
  ])('does not grant retries from lookalike or ambiguous errors: %s', async failure => {
    const args = { jobId: 'job1', model: 'model', store: memoryStore(), call: vi.fn().mockRejectedValue(failure) };
    await expect(durableReviewModel(args)(request)).rejects.toThrow();
    await expect(durableReviewModel(args)(request)).rejects.toThrow('requires_reconciliation');
    expect(args.call).toHaveBeenCalledOnce();
  });
  it('claims only one concurrent retry after an unpaid denial', async () => {
    let finish!: (value: string) => void;
    const call = vi.fn().mockRejectedValueOnce(new LivCostPretransportError('liv_cost_shared_policy_unconfigured'))
      .mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    const args = { jobId: 'job1', model: 'model', store: memoryStore(), call };
    await expect(durableReviewModel(args)(request)).rejects.toThrow('shared_policy_unconfigured');
    const first = durableReviewModel(args)(request); await Promise.resolve();
    await expect(durableReviewModel(args)(request)).rejects.toThrow('requires_reconciliation');
    finish('saved'); expect(await first).toBe('saved'); expect(call).toHaveBeenCalledTimes(2);
  });
  it('replays saved output across worker instances without calling the provider', async () => {
    const store = memoryStore();
    const call = vi.fn().mockResolvedValue('saved JSON');
    const args = { jobId: 'job1', model: 'configured-model', store, call };
    expect(await durableReviewModel(args)(request)).toBe('saved JSON');
    expect(await durableReviewModel(args)(request)).toBe('saved JSON');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('never restarts an uncertain provider request', async () => {
    const store = memoryStore();
    const call = vi.fn().mockRejectedValue(new Error('transport timeout'));
    const args = { jobId: 'job1', model: 'configured-model', store, call };
    await expect(durableReviewModel(args)(request)).rejects.toThrow('transport timeout');
    await expect(durableReviewModel(args)(request)).rejects.toThrow('requires_reconciliation');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('does not reuse output for a changed prompt or model', async () => {
    const args = { jobId: 'job1', model: 'model1', store: memoryStore(), call: vi.fn().mockResolvedValue('{}') };
    await durableReviewModel(args)(request);
    await expect(durableReviewModel(args)({ ...request, input: 'edited' })).rejects.toThrow('request_changed');
    await expect(durableReviewModel({ ...args, model: 'model2' })(request)).rejects.toThrow('request_changed');
    expect(args.call).toHaveBeenCalledTimes(1);
  });
  it('claims concurrent deliveries only once', async () => {
    let finish!: (value: string) => void;
    const call = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const args = { jobId: 'job1', model: 'model', store: memoryStore(), call };
    const first = durableReviewModel(args)(request);
    await Promise.resolve();
    await expect(durableReviewModel(args)(request)).rejects.toThrow('requires_reconciliation');
    finish('answer');
    expect(await first).toBe('answer');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('saves malformed output and never silently regenerates it', async () => {
    const args = { jobId: 'job1', model: 'model', store: memoryStore(), call: vi.fn().mockResolvedValue('bad JSON') };
    await durableReviewModel(args)(request);
    expect(await durableReviewModel(args)(request)).toBe('bad JSON');
    expect(args.call).toHaveBeenCalledTimes(1);
  });
  it('retries failed persistence without repeating the paid request', async () => {
    const backing = memoryStore();
    let attempts = 0;
    const store: ModelStageStore = { async transact(key, fn) {
      attempts++;
      if (attempts === 2) throw new Error('temporary storage outage');
      return backing.transact(key, fn);
    } };
    const call = vi.fn().mockResolvedValue('answer');
    expect(await durableReviewModel({ jobId: 'job1', model: 'model', store, call })(request)).toBe('answer');
    expect(call).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(3);
  });
});
