import { expect, it } from 'vitest';
import { providerDiagnostic } from '@/lib/ai/provider-diagnostic';
import { providerFailure, providerQuotaCodes } from '@/lib/ai/provider-error';
it.each(providerQuotaCodes)('recognizes the specific billing code %s before generic HTTP 429', code => {
  expect(providerFailure({ status: 429, error: { code, type: 'insufficient_quota' } })).toBe('quota_exhausted');
  expect(providerFailure({ status: 429, code })).toBe('quota_exhausted');
  expect(providerDiagnostic({ error: { code, type: 'insufficient_quota' } }, new Headers())).toMatchObject({ code, type: 'insufficient_quota' });
});
it('recognizes a future quota code by error type, in both SDK and raw response shape', () => {
  expect(providerFailure({ status: 429, code: 'future_billing_code', type: 'insufficient_quota' })).toBe('quota_exhausted');
  expect(providerFailure({ status: 429, error: { code: 'future_billing_code', type: 'insufficient_quota' } })).toBe('quota_exhausted');
  expect(providerFailure({ status: 429, code: 'slow_down', type: 'rate_limit_error' })).toBe('rate_limited');
});
it('retains only closed metadata and bounded rate headers', () => {
  const d = providerDiagnostic({ error: { code: 'rate_limit_exceeded', type: 'tokens',
    message: 'Rate limit reached for org_PRIVATE: tokens per min. Request too large. PRIVATE body' } }, new Headers({
    'retry-after': '12.5', 'x-ratelimit-limit-tokens': '10000', 'x-ratelimit-remaining-tokens': '0',
    'x-ratelimit-limit-requests': '500', 'x-request-id': 'PRIVATE-id' }));
  expect(d).toMatchObject({ code: 'rate_limit_exceeded', type: 'tokens', rateSignal: true, requestTooLarge: true,
    quotaSignal: false, retryAfterMs: 12500, limitTokens: 10000, remainingTokens: 0, limitRequests: 500 });
  expect(JSON.stringify(d)).not.toContain('PRIVATE');
});
it('distinguishes quota evidence and unknown non-JSON errors without guessing free usage', () => {
  expect(providerDiagnostic({ error: { code: 'insufficient_quota', message: 'You exceeded your current quota.' } }, new Headers()))
    .toMatchObject({ code: 'insufficient_quota', quotaSignal: true, rateSignal: false, retryAfterMs: null });
  expect(providerDiagnostic(null, new Headers({ 'retry-after': '-1', 'x-ratelimit-limit-tokens': 'secret' })))
    .toMatchObject({ code: null, type: null, jsonBody: false, quotaSignal: false, retryAfterMs: null, limitTokens: null });
  expect(providerDiagnostic({ error: { code: 'secret', type: 'secret' } }, new Headers())).toMatchObject({ code: 'other', type: 'other' });
});
