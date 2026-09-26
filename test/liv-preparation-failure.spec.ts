import { expect, it } from 'vitest';
import { preparationDependencyCode, preparationDependencyFailure } from '@/lib/liv/preparation-failure';
import { getLivCostPretransportError, LivCostPretransportError } from '@/lib/liv/cost-errors';
import { decidePreparation } from '@/lib/liv/preparation-policy';
import { SourceSimilarityError } from '@/lib/liv/source-similarity-error';

it('does not label an incomplete editorial check with HTTP 503 as a provider outage', () => {
  const error = new SourceSimilarityError({ pass: false, complete: false, failure: 'semantic-review-invalid',
    scores: { embeddingSim: .86, ngramJaccard: .01, openingSim: .04 } },
    { url: 'https://press.test/exhibition', contentHash: 'a'.repeat(64) });
  expect(error.status).toBe(503);
  expect(preparationDependencyFailure(error)).toBeNull();
});

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

it.each(['APIConnectionError', 'APIConnectionTimeoutError', 'AbortError', 'TimeoutError'])
  ('records %s as uncertain, never as an unpaid/retryable request', name => {
    const error = new Error('private transport details'); error.name = name;
    expect(preparationDependencyFailure(error)).toBe('liv_provider_result_unconfirmed');
    expect(preparationDependencyCode('liv_provider_result_unconfirmed')).toBe('liv_provider_result_unconfirmed');
    expect(getLivCostPretransportError(error)).toBeNull();
  });
