import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: {} as any, plan: {} as any, audit: false, writes: vi.fn(), creates: vi.fn(), docs: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: () => ({ doc: (id: string) => { state.docs(id); return { id, collection: () => ({ doc: () => ({ id: 'audit' }) }) }; } }),
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
it('retries only the separately identified alternative and leaves the saved plan unchanged', async () => {
  const before = structuredClone(state.plan);
  await authorizePreparationRetry({ ...input, scope: 'prepare-alternative' });
  expect(state.docs).toHaveBeenCalledWith('prepare-alternative-2026-09-12');
  expect(state.docs).not.toHaveBeenCalledWith('prepare-2026-09-12');
  expect(state.plan).toEqual(before);
  expect(state.row.articleCheckpoint.title).toBe('Saved');
});
it('never combines an alternative retry with a reserve or replacement plan', async () => {
  for (const invalid of [{ ...input, scope: 'prepare-alternative' as const, kind: 'reserve' as const },
    { ...input, scope: 'prepare-alternative' as const, plan: { topicHint: 'Other', directiveHint: '' } }]) {
    await expect(authorizePreparationRetry(invalid)).rejects.toThrow('invalid');
  }
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

it('preserves an explicitly requested review format in a replacement plan', async () => {
  delete state.row.articleCheckpoint;
  await authorizePreparationRetry({ ...input, plan: { topicHint: 'Klovn', directiveHint: 'To stjerner', articleFormat: 'research-review' } });
  expect(state.plan.articleFormat).toBe('research-review');
});

it('rejects unsupported replacement formats before granting a retry', async () => {
  delete state.row.articleCheckpoint;
  await expect(authorizePreparationRetry({ ...input, plan: { topicHint: 'Klovn', directiveHint: '', articleFormat: 'unknown' as any } })).rejects.toThrow('invalid');
  expect(state.writes).not.toHaveBeenCalled();
  expect(state.creates).not.toHaveBeenCalled();
});

it('attaches an explicit paid writer recovery pointer without replacing its topic or counters', async () => {
  state.row = { status: 'failed', topic: 'Saved topic', preparationAttempts: 6 };
  const resumeWritingRunId = '4f5f2284-420d-4622-ac68-b42c0bc18ffd';
  await authorizePreparationRetry({ ...input, resumeWritingRunId });
  expect(state.row).toMatchObject({ topic: 'Saved topic', preparationAttempts: 6, resumeWritingRunId });
  expect(state.creates).toHaveBeenCalledWith(expect.objectContaining({ resumeWritingRunId }));
});

it('never combines paid writer recovery with a changed editorial plan', async () => {
  await expect(authorizePreparationRetry({ ...input, resumeWritingRunId: '4f5f2284-420d-4622-ac68-b42c0bc18ffd',
    plan: { topicHint: 'Other', directiveHint: 'Other' } })).rejects.toThrow('invalid');
  expect(state.writes).not.toHaveBeenCalled();
});
