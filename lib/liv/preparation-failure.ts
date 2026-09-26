import { providerFailure, type ProviderFailure } from '@/lib/ai/provider-error';
import { getLivCostPretransportError } from './cost-errors';
import { SourceSimilarityError } from './source-similarity-error';

const providerFailures: ProviderFailure[] = ['quota_exhausted', 'rate_limited',
  'authentication_failed', 'access_denied', 'provider_unavailable'];

/** Classification only. This does NOT establish that a call was unpaid, grant
 * a retry or clear a provider hold. In particular HTTP JSON cannot recreate
 * LivCostPretransportError's in-process evidence. */
export function preparationDependencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^liv_cost_[a-z_]{1,80}$/.test(value)) return value;
  if (value === 'liv_provider_result_unconfirmed') return value;
  return providerFailures.some(failure => value === `liv_provider_${failure}`) ? value : null;
}

export function preparationDependencyFailure(error: unknown): string | null {
  const denied = getLivCostPretransportError(error);
  if (denied) return preparationDependencyCode(denied.code);
  // Editorial validation has its own HTTP 503; it is not an upstream outage.
  if (error instanceof SourceSimilarityError) return null;
  const failure = providerFailure(error);
  if (failure) return `liv_provider_${failure}`;
  // A lost response/abort is not evidence that the provider did no work. Keep a
  // closed code in history instead of treating the SDK's message as bad content.
  if (error instanceof Error && ['APIConnectionError', 'APIConnectionTimeoutError',
    'AbortError', 'TimeoutError'].includes(error.name)) return 'liv_provider_result_unconfirmed';
  return null;
}
