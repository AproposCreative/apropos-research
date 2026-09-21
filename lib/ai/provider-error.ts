/** Closed error taxonomy shared by research and cost tracking. Never expose provider bodies. */
export type ProviderFailure = 'quota_exhausted' | 'rate_limited' | 'authentication_failed' | 'access_denied' | 'provider_unavailable';
// OpenAI may use a specific billing code while retaining type=insufficient_quota.
// https://developers.openai.com/api/docs/guides/error-codes (checked 2026-09-21)
export const providerQuotaCodes = ['insufficient_quota', 'billing_hard_limit_reached', 'credit_balance_exhausted',
  'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'] as const;
export function providerFailure(error: unknown): ProviderFailure | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { status?: unknown; code?: unknown; type?: unknown; error?: { code?: unknown; type?: unknown } };
  const code = e.code ?? e.error?.code;
  const type = e.type ?? e.error?.type;
  if (providerQuotaCodes.includes(code as typeof providerQuotaCodes[number]) || type === 'insufficient_quota') return 'quota_exhausted';
  if (e.status === 429 || code === 'rate_limit_exceeded') return 'rate_limited';
  if (e.status === 401 || code === 'invalid_api_key') return 'authentication_failed';
  if (e.status === 403) return 'access_denied';
  if (typeof e.status === 'number' && e.status >= 500) return 'provider_unavailable';
  return null;
}
export const providerFailureLabel: Record<ProviderFailure, string> = {
  quota_exhausted: 'AI-udbyderen afviser kald: credits eller forbrugsgrænse er opbrugt.',
  rate_limited: 'AI-udbyderen afviser kald med HTTP 429. Kontrollér kvitteringens fejldiagnose.',
  authentication_failed: 'AI-udbyderen afviser API-nøglen.',
  access_denied: 'API-nøglen mangler adgang hos AI-udbyderen.',
  provider_unavailable: 'AI-udbyderen er midlertidigt utilgængelig.',
};
export class ResearchProviderError extends Error {
  constructor(readonly failure: ProviderFailure) { super(`research_provider_${failure}`); }
}
