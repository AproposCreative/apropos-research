import { editorialRequestAccess } from '@/lib/editorial-access';
import { listImageGenArticles, readImageGenArticle } from '@/lib/image-gen/webflow';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await editorialRequestAccess(request)) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  const params = new URL(request.url).searchParams, id = params.get('id');
  const cursor = params.get('cursor') ?? '0', query = params.get('q') ?? '';
  if ((id !== null && !/^[a-f0-9]{24}$/.test(id)) || !/^\d{1,6}$/.test(cursor) || query.length > 150) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers });
  }
  try { return Response.json(id ? await readImageGenArticle(id) : await listImageGenArticles({ cursor: Number(cursor), query }), { headers }); }
  catch { return Response.json({ error: 'Webflow-artiklerne kunne ikke hentes.' }, { status: 503, headers }); }
}
