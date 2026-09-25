import { expect, it } from 'vitest';
import { canPrepareReserveFallback } from '@/lib/liv/reserve-fallback-policy';
import type { ScheduledPreparation } from '@/lib/liv/next-preparation';
const candidate = (reason = 'source_similarity_incomplete'): ScheduledPreparation => ({
  dayKey: '2026-09-26', kind: 'scheduled', scope: 'prepare-alternative',
  row: { status: 'failed', reason },
  decision: { action: 'blocked', stage: 'article', reasonCode: 'alternative_limit_reached', nextAttemptAt: null },
});
it('allows one separate reserve after two content candidates, without reopening them', () => {
  const c = candidate(); const before = structuredClone(c);
  expect(canPrepareReserveFallback(c)).toBe(true); expect(c).toEqual(before);
});
it.each(['provider_quota_exhausted', 'liv_cost_monthly_budget_exceeded', 'authentication_required',
  'provider_result_unconfirmed', 'unknown'])('never buys a reserve to bypass %s', reason => {
  expect(canPrepareReserveFallback(candidate(reason))).toBe(false);
});
it.each(['cmsSaveStarted', 'webflowItemId', 'preparationProof'])('preserves uncertain CMS work: %s', key => {
  const c = candidate(); c.row![key] = true; expect(canPrepareReserveFallback(c)).toBe(false);
});
it('does not compete with a waiting or executable scheduled job', () => {
  const c = candidate(); c.decision.action = 'wait'; expect(canPrepareReserveFallback(c)).toBe(false);
  c.decision.action = 'resume'; expect(canPrepareReserveFallback(c)).toBe(false);
});
