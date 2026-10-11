import { mcpRequestAccess } from '@/lib/mcp/oauth';
import { PRIVATE_HEADERS } from '@/lib/mcp/config';
import { reviewQueue, reviewSavedArticle, reviewSource } from '@/lib/editorial/review-queue';
export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS });
export async function GET(request: Request) {
  const access = await mcpRequestAccess(request);
  if (!access) return reply({ error: 'unauthorized' }, 401);
  // Global Liv archives remain owner-only, matching the MCP tools.
  if (!access.owner) return reply({ error: 'owner_required' }, 403);
  try {
    const params = new URL(request.url).searchParams;
    if (!params.has('source')) return reply(await reviewQueue(access.uid));
    const source = reviewSource.parse(params.get('source')), id = params.get('id') || '';
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) return reply({ error: 'invalid_id' }, 400);
    return reply(await reviewSavedArticle(access.uid, source, id));
  } catch { return reply({ error: 'Artiklen eller oversigten kunne ikke hentes. Intet er ændret; genindlæs status.' }, 409); }
}
