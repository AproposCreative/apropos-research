import { expect, it } from 'vitest';
import { preparationDependencyCode, preparationDependencyFailure } from '@/lib/liv/preparation-failure';
import { getLivCostPretransportError, LivCostPretransportError } from '@/lib/liv/cost-errors';
import { decidePreparation } from '@/lib/liv/preparation-policy';

it('preserves the SDK-wrapped cost cause instead of buying a different topic', () => {
  const error = new Error('Connection error', { cause: new LivCostPretransportError('liv_cost_provider_quota_exhausted') });
  const reason = preparationDependencyFailure(error);
  expect(reason).toBe('liv_cost_provider_quota_exhausted');
  expect(decidePreparation({ status: 'failed', reason }).action).toBe('blocked');
});
it.each([[429, 'insufficient_quota', 'quota_exhausted'], [429, 'rate_limit_exceeded', 'rate_limited'],
  [401, '', 'authentication_failed'], [403, '', 'access_denied'], [503, '', 'provider_unavailable']])
  ('classifies provider %s without granting a new topic or unpaid evidence', (status, code, failure) => {
    const reason = preparationDependencyFailure({ status, code });
    expect(reason).toBe(`liv_provider_${failure}`);
    expect(decidePreparation({ status: 'failed', reason }).action).toBe('blocked');
    expect(getLivCostPretransportError(new Error(reason!))).toBeNull();
  });
it('does not revive pretransport evidence from strings or JSON', () => {
  expect(preparationDependencyFailure(new Error('liv_cost_monthly_budget_exceeded'))).toBeNull();
  expect(preparationDependencyFailure({ name: 'LivCostPretransportError', code: 'liv_cost_monthly_budget_exceeded' })).toBeNull();
  expect(preparationDependencyCode('liv_provider_approve')).toBeNull();
  expect(preparationDependencyCode('liv_cost_bad: secret')).toBeNull();
});
