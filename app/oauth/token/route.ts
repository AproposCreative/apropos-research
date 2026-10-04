import { exchangeToken, oauthRateLimit } from '@/lib/mcp/oauth';
import { json, oauthFailure, smallBody } from '@/lib/mcp/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { await oauthRateLimit('token', 240); return json(await exchangeToken(Object.fromEntries(new URLSearchParams(await smallBody(request))))); }
  catch (e) { return oauthFailure(e); }
}
