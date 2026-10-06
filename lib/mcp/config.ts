// Fixed audience/issuer: never derive OAuth redirects or token audiences from Host.
export const MCP_ORIGIN = 'https://ai.aproposmagazine.com';
export const MCP_RESOURCE = `${MCP_ORIGIN}/mcp`;
export const MCP_SCOPES = ['apropos:read', 'apropos:draft', 'apropos:publish'] as const;
export const MCP_VERSION = '2026-10-06-v10';
export const MCP_ICON = `${MCP_ORIGIN}/images/apropos-ai-icon.png`;
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export const OAUTH_COOKIE = '__Host-apropos-mcp';
export function allowedRedirect(value: string) {
  // Documented ChatGPT callback formats only; no arbitrary client-provided origin.
  return value === 'https://chatgpt.com/connector_platform_oauth_redirect' ||
    /^https:\/\/chatgpt\.com\/connector\/oauth\/[a-zA-Z0-9_-]{8,200}$/.test(value);
}
export const authorizationMetadata = {
  issuer: MCP_ORIGIN, authorization_endpoint: `${MCP_ORIGIN}/oauth/authorize`,
  token_endpoint: `${MCP_ORIGIN}/oauth/token`, registration_endpoint: `${MCP_ORIGIN}/oauth/register`,
  revocation_endpoint: `${MCP_ORIGIN}/oauth/revoke`,
  response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
  scopes_supported: [...MCP_SCOPES], authorization_response_iss_parameter_supported: true,
};
export const protectedMetadata = {
  resource: MCP_RESOURCE, authorization_servers: [MCP_ORIGIN], scopes_supported: [...MCP_SCOPES],
  bearer_methods_supported: ['header'], resource_name: 'Apropos AI',
};
