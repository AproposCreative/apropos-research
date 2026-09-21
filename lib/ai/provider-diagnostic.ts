/** Closed, content-free diagnostics. Never persist raw messages, account IDs or headers. */
import { providerQuotaCodes } from './provider-error';
const codes = [...providerQuotaCodes, 'rate_limit_exceeded', 'slow_down', 'server_is_overloaded',
  'requests_limit_exceeded', 'tokens_limit_exceeded', 'invalid_api_key', 'model_not_found',
  'organization_deactivated', 'access_terminated', 'server_error'] as const;
const types = ['insufficient_quota', 'tokens', 'requests', 'invalid_request_error',
  'rate_limit_error', 'server_error'] as const;
export type ProviderDiagnostic = {
  code: typeof codes[number] | 'other' | null;
  type: typeof types[number] | 'other' | null;
  jsonBody: boolean;
  quotaSignal: boolean;
  rateSignal: boolean;
  requestTooLarge: boolean;
  retryAfterMs: number | null;
  limitTokens: number | null;
  remainingTokens: number | null;
  limitRequests: number | null;
  remainingRequests: number | null;
};
const numeric = (value: string | null): number | null => {
  if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1e12 ? n : null;
};
export function providerDiagnostic(body: unknown, headers: Headers): ProviderDiagnostic {
  const row = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const e = row?.error && typeof row.error === 'object' ? row.error as Record<string, unknown> : {};
  const message = typeof e.message === 'string' ? e.message.slice(0, 8000).toLowerCase() : '';
  const retryMs = numeric(headers.get('retry-after-ms'));
  const retrySeconds = numeric(headers.get('retry-after'));
  return {
    code: typeof e.code !== 'string' ? null : codes.includes(e.code as typeof codes[number]) ? e.code as typeof codes[number] : 'other',
    type: typeof e.type !== 'string' ? null : types.includes(e.type as typeof types[number]) ? e.type as typeof types[number] : 'other',
    jsonBody: row !== null,
    quotaSignal: /insufficient_quota|billing_hard_limit|exceeded your current quota|run out of credits|no balance left|billing quota/.test(message),
    rateSignal: /rate limit|requests per min|tokens per min/.test(message),
    requestTooLarge: /request too large|requested tokens exceed|exceeds.*token.*limit/.test(message),
    retryAfterMs: retryMs !== null ? retryMs : retrySeconds !== null && retrySeconds <= 1e9 ? retrySeconds * 1000 : null,
    limitTokens: numeric(headers.get('x-ratelimit-limit-tokens')),
    remainingTokens: numeric(headers.get('x-ratelimit-remaining-tokens')),
    limitRequests: numeric(headers.get('x-ratelimit-limit-requests')),
    remainingRequests: numeric(headers.get('x-ratelimit-remaining-requests')),
  };
}
