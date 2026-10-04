import { revokeToken, oauthRateLimit } from '@/lib/mcp/oauth';
import { json, oauthFailure, smallBody } from '@/lib/mcp/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { await oauthRateLimit('revoke', 120); const body = new URLSearchParams(await smallBody(request));
    await revokeToken(body.get('token') || '', body.get('client_id') || ''); return json({}); }
  catch (e) { return oauthFailure(e); }
}
