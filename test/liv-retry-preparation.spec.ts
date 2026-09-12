import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: {} as any, plan: {} as any, audit: false, writes: vi.fn(), creates: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: () => ({ doc: (id: string) => ({ id, collection: () => ({ doc: () => ({ id: 'audit' }) }) }) }),
  runTransaction: async (fn: any) => fn({
    get: async (ref: any) => ref.id === 'audit' ? { exists: state.audit } : { data: () => ref.id.startsWith('plan-') ? state.plan : state.row },
    create: (_ref: any, row: any) => { state.creates(row); state.audit = true; },
    set: (ref: any, patch: any) => { state.writes(patch); Object.assign(ref.id.startsWith('plan-') ? state.plan : state.row, patch); },
  }),
}) }));
import { authorizePreparationRetry } from '@/lib/liv/retry-preparation';
const input = { dayKey: '2026-09-12', kind: 'scheduled' as const, requestId: 'fixed-provider-1', reason: 'Provider credit restored' };
beforeEach(() => { state.row = { status: 'failed', preparationAttempts: 5, articleCheckpoint: { title: 'Saved' } };
  state.plan = { topicHint: 'Old topic' }; state.audit = false; vi.clearAllMocks(); });
it('retains the full previous run, counters and paid work, granting only one attempt per request', async () => {
  expect(await authorizePreparationRetry(input)).toEqual({ status: 'retry_authorized' });
  expect(state.creates).toHaveBeenCalledWith(expect.objectContaining({ previous: expect.objectContaining({ preparationAttempts: 5 }) }));
  expect(state.row.articleCheckpoint.title).toBe('Saved');
  expect(state.row.preparationAttempts).toBe(5);
  expect(await authorizePreparationRetry(input)).toEqual({ status: 'already_requested' });
  expect(state.writes).toHaveBeenCalledTimes(1);
});
it.each(['webflowItemId', 'preparationProof', 'cmsSaveStarted', 'retryAuthorization', 'continuationReady'])('rejects conflicting or uncertain work: %s', async key => {
  state.row[key] = true;
  await expect(authorizePreparationRetry(input)).rejects.toThrow('conflict');
  expect(state.creates).not.toHaveBeenCalled();
});
it('never reclaims a still-running worker', async () => {
  state.row = { status: 'processing', processingStartedAt: { toMillis: () => Date.now() } };
  await expect(authorizePreparationRetry(input)).rejects.toThrow('processing');
});
it('rejects invalid identity before storing anything', async () => {
  await expect(authorizePreparationRetry({ ...input, dayKey: '2026-02-30' })).rejects.toThrow('invalid');
  expect(state.writes).not.toHaveBeenCalled();
});
it('can atomically replace an unstarted plan while retaining its previous version', async () => {
  delete state.row.articleCheckpoint;
  await authorizePreparationRetry({ ...input, plan: { topicHint: 'New topic', directiveHint: 'Research it' } });
  expect(state.plan).toMatchObject({ topicHint: 'New topic', status: 'pending' });
  expect(state.creates).toHaveBeenCalledWith(expect.objectContaining({ previousPlan: expect.anything() }));
});
it('never changes the topic attached to already-paid work', async () => {
  await expect(authorizePreparationRetry({ ...input, plan: { topicHint: 'New topic', directiveHint: 'Research it' } })).rejects.toThrow('conflict');
  expect(state.writes).not.toHaveBeenCalled();
});
