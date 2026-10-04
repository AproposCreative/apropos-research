import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticateMcp, oauthRateLimit, OAuthError } from '@/lib/mcp/oauth';
import { createEditorialMcp } from '@/lib/mcp/server';
import { MCP_ORIGIN, PRIVATE_HEADERS } from '@/lib/mcp/config';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && ![MCP_ORIGIN, 'https://chatgpt.com'].includes(origin)) return new Response(null, { status: 403 });
  try {
    const identity = await authenticateMcp(request);
    if (!identity) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { ...PRIVATE_HEADERS,
      'WWW-Authenticate': `Bearer resource_metadata="${MCP_ORIGIN}/.well-known/oauth-protected-resource"` } });
    await oauthRateLimit(`tools-${identity.uid}`, 240);
    const server = createEditorialMcp(identity);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 510000 });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request);
      Object.entries(PRIVATE_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
      return response;
    } finally { await server.close(); }
  } catch (error) { return Response.json({ error: error instanceof OAuthError ? error.code : 'mcp_temporarily_unavailable' },
    { status: error instanceof OAuthError ? error.status : 503, headers: PRIVATE_HEADERS }); }
}
// No unauthenticated event streams, session state or side effects from a GET.
export const GET = () => new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: 'POST' } });
export const DELETE = GET;
