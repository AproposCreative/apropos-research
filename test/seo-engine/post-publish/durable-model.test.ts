import { describe, expect, it, vi } from 'vitest';
import { durableReviewModel, type ModelStageStore, type ModelStageRecord } from '../../../lib/seo-engine/post-publish/durable-model';

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
