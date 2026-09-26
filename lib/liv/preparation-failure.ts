import { providerFailure, type ProviderFailure } from '@/lib/ai/provider-error';
import { getLivCostPretransportError } from './cost-errors';

const providerFailures: ProviderFailure[] = ['quota_exhausted', 'rate_limited',
  'authentication_failed', 'access_denied', 'provider_unavailable'];

/** Classification only. This does NOT establish that a call was unpaid, grant
 * a retry or clear a provider hold. In particular HTTP JSON cannot recreate
 * LivCostPretransportError's in-process evidence. */
export function preparationDependencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^liv_cost_[a-z_]{1,80}$/.test(value)) return value;
  return providerFailures.some(failure => value === `liv_provider_${failure}`) ? value : null;
}

export function preparationDependencyFailure(error: unknown): string | null {
  const denied = getLivCostPretransportError(error);
  if (denied) return preparationDependencyCode(denied.code);
  const failure = providerFailure(error);
  return failure ? `liv_provider_${failure}` : null;
}
