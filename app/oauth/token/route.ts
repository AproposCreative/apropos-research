import { exchangeToken, oauthRateLimit } from '@/lib/mcp/oauth';
import { json, oauthFailure, smallBody } from '@/lib/mcp/http';
import { after } from 'next/server';
import { deliverMcpWelcome } from '@/lib/mcp/welcome';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try { await oauthRateLimit('token', 240); return json(await exchangeToken(Object.fromEntries(new URLSearchParams(await smallBody(request))),
    uid => after(async () => { try { await deliverMcpWelcome(uid); } catch { console.error('mcp_welcome_dispatch_unconfirmed'); } }))); }
  catch (e) { return oauthFailure(e); }
}
