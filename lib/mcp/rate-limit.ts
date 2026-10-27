import { oauthRateLimit, OAuthRateLimitError } from './oauth';
import { MCP_VERSION } from './config';

export const MCP_TOOL_CALLS_PER_HOUR = 240;
// Stateless clients negotiate/discover/notify (and sometimes renegotiate) for
// each logical call. Bound that traffic separately from editorial operations.
export const MCP_TRANSPORT_REQUESTS_PER_HOUR = 1200;

export const limitMcpTransport = (uid: string) =>
  oauthRateLimit(`transport-v2-${uid}`, MCP_TRANSPORT_REQUESTS_PER_HOUR);
export const limitMcpToolCall = (uid: string) =>
  oauthRateLimit(`tool-calls-v2-${uid}`, MCP_TOOL_CALLS_PER_HOUR);

export function mcpRateLimitRecovery(error: OAuthRateLimitError, scope: 'transport' | 'tool_calls') {
  const resetAt = new Date(error.resetAt).toISOString();
  // No identity, token, grant, body, prompt, URL or source content in logs.
  console.warn('mcp_rate_limited', { version: MCP_VERSION, status: 429, scope,
    limit: error.limit, resetAt, retryAfterSeconds: error.retryAfterSeconds });
  return {
    error: 'rate_limited', limiter: 'apropos_mcp', scope, limit: error.limit,
    windowSeconds: 3600, resetAt, retryAfterSeconds: error.retryAfterSeconds,
    operationStarted: false, automaticRetryAllowed: false, paidAiAllowed: false,
    action: `Apropos MCP har nået sin timegrænse. Det afviste arbejde er ikke startet. Vent til ${resetAt}; fortsæt derefter fra gemt status med samme artikelversion og eksisterende IDs. Gentag ikke kald før da. Dette er ikke en AI-saldo- eller billedtilladelsesfejl; opret ikke nye forbindelser eller billedforsøg for at omgå grænsen.`,
  };
}
