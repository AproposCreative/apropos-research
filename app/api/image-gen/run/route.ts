import { after } from 'next/server';
import { imageGenRequestAccess } from '@/lib/image-gen/access';
import { claimImageGenJob } from '@/lib/image-gen/jobs';
import { runImageGenJob } from '@/lib/image-gen/runtime';
import { imageGenQuotes } from '@/lib/image-gen/quotes';
export const runtime = 'nodejs';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request) {
  const access = await imageGenRequestAccess(request);
  if (!access) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  if (Number(request.headers.get('content-length') ?? 0) > 20000) return Response.json({ error: 'too_large' }, { status: 413, headers });
  const raw = await request.text();
  if (raw.length > 20000) return Response.json({ error: 'too_large' }, { status: 413, headers });
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'invalid_request' }, { status: 400, headers }); }
  if (!body || !['ideas', 'generate', 'edit', 'press-import'].includes(body.operation) || !body.parameters || typeof body.parameters !== 'object' || Array.isArray(body.parameters)) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers });
  }
  try {
    const quotes = body.operation === 'press-import' ? null : await imageGenQuotes();
    if (quotes && body.quoteId !== quotes[body.operation as keyof typeof quotes]?.id) {
      return Response.json({ error: 'Prisoverslaget skal opdateres før bestilling.' }, { status: 409, headers });
    }
    // Plain initial ideas use one deterministic key; refresh needs a new explicit requestId.
    const input = { requestId: body.operation === 'ideas' && body.refresh !== true ? `ideas-${body.articleVersion}` : body.requestId,
      articleId: body.articleId, articleVersion: body.articleVersion, operation: body.operation,
      parameters: { ...body.parameters, acceptedQuoteId: body.quoteId ?? null } };
    const claim = await claimImageGenJob(access.uid, input);
    if (claim.created) after(() => runImageGenJob(claim.job));
    return Response.json({ job: claim.job }, { status: claim.created ? 202 : 200, headers });
  } catch { return Response.json({ error: 'Bestillingen kunne ikke startes. Kontrollér billedhistorikken før et nyt forsøg.' }, { status: 409, headers }); }
}
