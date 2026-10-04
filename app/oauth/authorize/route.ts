import { startAuthorization, opaque } from '@/lib/mcp/oauth';
import { MCP_ORIGIN, OAUTH_COOKIE, PRIVATE_HEADERS } from '@/lib/mcp/config';
import { oauthFailure } from '@/lib/mcp/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const secret = opaque();
    const id = await startAuthorization(Object.fromEntries(new URL(request.url).searchParams), secret);
    return new Response(null, { status: 302, headers: { ...PRIVATE_HEADERS,
      Location: `${MCP_ORIGIN}/connect/chatgpt?request=${id}`,
      'Set-Cookie': `${OAUTH_COOKIE}=${secret}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
  } catch (e) { return oauthFailure(e); }
}
