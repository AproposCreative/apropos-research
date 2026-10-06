import { mcpRequestAccess } from '@/lib/mcp/oauth';
import { readConnectionStatus } from '@/lib/mcp/connections';
import { json } from '@/lib/mcp/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await mcpRequestAccess(request);
  if (!access) return json({ error: 'access_denied' }, 403);
  try { return json(await readConnectionStatus(access.uid)); }
  catch { return json({ error: 'connection_status_unavailable' }, 503); }
}
