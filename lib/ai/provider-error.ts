/** Closed error taxonomy shared by research and cost tracking. Never expose provider bodies. */
export type ProviderFailure = 'quota_exhausted' | 'rate_limited' | 'authentication_failed' | 'access_denied' | 'provider_unavailable';
export function providerFailure(error: unknown): ProviderFailure | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { status?: unknown; code?: unknown; error?: { code?: unknown } };
  const code = e.code ?? e.error?.code;
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') return 'quota_exhausted';
  if (e.status === 429 || code === 'rate_limit_exceeded') return 'rate_limited';
  if (e.status === 401 || code === 'invalid_api_key') return 'authentication_failed';
  if (e.status === 403) return 'access_denied';
  if (typeof e.status === 'number' && e.status >= 500) return 'provider_unavailable';
  return null;
}
export const providerFailureLabel: Record<ProviderFailure, string> = {
  quota_exhausted: 'AI-udbyderen afviser kald: credits eller forbrugsgrænse er opbrugt.',
  rate_limited: 'AI-udbyderen begrænser kald lige nu (429).',
  authentication_failed: 'AI-udbyderen afviser API-nøglen.',
  access_denied: 'API-nøglen mangler adgang hos AI-udbyderen.',
  provider_unavailable: 'AI-udbyderen er midlertidigt utilgængelig.',
};
export class ResearchProviderError extends Error {
  constructor(readonly failure: ProviderFailure) { super(`research_provider_${failure}`); }
}
