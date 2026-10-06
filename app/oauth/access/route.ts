import { mcpRequestAccess } from '@/lib/mcp/oauth';
import { json } from '@/lib/mcp/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const member = await mcpRequestAccess(request);
  return json(member ? { allowed: true, capabilities: { owner: member.owner },
    rights: ['read_shared_articles', 'edit_own_work', 'publish_own_submissions'],
    subscriptionUsage: 'not_observable_here' } : { allowed: false }, member ? 200 : 403);
}
