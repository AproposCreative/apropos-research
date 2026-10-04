import { registerClient } from '@/lib/mcp/oauth';
import { json, oauthFailure, smallBody } from '@/lib/mcp/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { return json(await registerClient(JSON.parse(await smallBody(request))), 201); } catch (e) { return oauthFailure(e); }
}
