import { expect, it, vi } from 'vitest';
import { claimedRecovery, decidePreparation } from '@/lib/liv/preparation-policy';
import { nextScheduledPreparation } from '@/lib/liv/next-preparation';
import { emptyDeliveryState } from '@/lib/liv/delivery-policy';

const now = new Date('2026-09-20T08:00:00Z');
it('recovers the September 20 length failure without resetting old attempts', () => {
  const row = { status: 'failed', reason: 'liv_preparation_structure_failed', preparationAttempts: 5,
    articleCheckpoint: { content: 'paid text', preparedMedia: [{}, {}, {}] } };
  const d = decidePreparation(row, +now);
  expect(d.action).toBe('repair');
  expect(claimedRecovery(row, d, +now)).toMatchObject({ version: 1, legacyAttempts: 5, repairs: 1 });
  expect(row.preparationAttempts).toBe(5);
  expect(decidePreparation({ ...row, recovery: { version: 1, repairs: 2 } }).action).toBe('alternative');
});
it('allows at most two corrections, including completed historical corrections', () => {
  expect(decidePreparation({ status: 'failed', reason: 'liv_preparation_structure_failed',
    articleCheckpoint: { factRevisionCount: 2 } }).action).toBe('alternative');
});
it('never retries ambiguous writes or provider results', () => {
  for (const key of ['cmsSaveStarted', 'webflowItemId', 'preparationProof']) {
    expect(decidePreparation({ status: 'failed', [key]: true }).action).toBe('reconcile');
  }
  expect(decidePreparation({ status: 'failed', reason: 'liv_fact_revision_requires_reconciliation' }).action).toBe('alternative');
  expect(decidePreparation({ status: 'processing', processingStartedAt: 1 }, +now).action).toBe('alternative');
});
it('bounds transient source retries with 5/15 minute backoff, not poll count', () => {
  const row = { status: 'failed', reason: 'liv_trending_http_503', completedAt: +now };
  expect(decidePreparation(row, +now)).toMatchObject({ action: 'wait', nextAttemptAt: +now + 300000 });
  expect(decidePreparation(row, +now + 300000).action).toBe('retry');
  const recovery = claimedRecovery(row, decidePreparation(row, +now + 300000));
  expect(decidePreparation({ ...row, recovery }, +now + 300000)).toMatchObject({ action: 'wait', nextAttemptAt: +now + 900000 });
  expect(decidePreparation({ ...row, recovery: { version: 1, retries: 2 } }, +now).action).toBe('alternative');
});
it('never uses an alternative to bypass a cost stop', async () => {
  const read = vi.fn(async () => ({ status: 'failed', reason: 'liv_cost_monthly_budget_exceeded' }));
  expect((await nextScheduledPreparation(emptyDeliveryState(), read, now))?.decision).toMatchObject({ action: 'blocked', reasonCode: 'budget_limit' });
  expect(read).toHaveBeenCalledTimes(1);
});
it('uses one separate alternative for saved-work/evidence failures and preserves rows', async () => {
  for (const row of [{ status: 'skipped_no_topic', preparationAttempts: 3, articleCheckpoint: {} },
    { status: 'failed', reason: 'article_evidence_insufficient', preparationAttempts: 3 }]) {
    const before = structuredClone(row);
    const result = await nextScheduledPreparation(emptyDeliveryState(), async (_d, s) => s === 'prepare' ? row : undefined, now);
    expect(result).toMatchObject({ dayKey: '2026-09-20', scope: 'prepare-alternative', decision: { action: 'start' } });
    expect(row).toEqual(before);
  }
});
it('rechecks an empty bank without consuming the alternative or paid retry allowance', async () => {
  const row = { status: 'skipped_no_topic', preparationAttempts: 3, completedAt: +now };
  expect(decidePreparation(row, +now)).toMatchObject({ action: 'wait', nextAttemptAt: +now + 900000 });
  const decision = decidePreparation(row, +now + 900000);
  expect(decision.action).toBe('retry');
  expect(claimedRecovery(row, decision)).toMatchObject({ sourceChecks: 1, retries: 0, legacyAttempts: 3 });
  expect(await nextScheduledPreparation(emptyDeliveryState(), async () => row, new Date(+now + 900000)))
    .toMatchObject({ scope: 'prepare', decision: { action: 'retry' } });
  expect(decidePreparation({ ...row, resumeWritingRunId: 'paid' }, +now + 900000).action).toBe('alternative');
});
it('goes on to tomorrow after both candidates fail, never creates a third today', async () => {
  const read = vi.fn(async (d: string) => d === '2026-09-20' ? { status: 'failed' } : undefined);
  expect(await nextScheduledPreparation(emptyDeliveryState(), read, now)).toMatchObject({ dayKey: '2026-09-21', scope: 'prepare' });
  expect(read.mock.calls.map(c => c[0])).toEqual(['2026-09-20', '2026-09-20', '2026-09-21']);
});
it('prepares only tomorrow after the deadline', async () => {
  expect(await nextScheduledPreparation(emptyDeliveryState(), async () => undefined, new Date('2026-09-20T18:00:00Z')))
    .toMatchObject({ dayKey: '2026-09-21' });
});
it('leaves all work alone while a publication is uncertain', async () => {
  const state = emptyDeliveryState();
  state.slots['2026-09-19'] = { state: 'attempted', itemId: 'saved', token: 'lease', attempts: 1, nextAttemptAt: 0, leaseUntil: 0 };
  const read = vi.fn();
  expect(await nextScheduledPreparation(state, read, now)).toBeNull();
  expect(read).not.toHaveBeenCalled();
});
