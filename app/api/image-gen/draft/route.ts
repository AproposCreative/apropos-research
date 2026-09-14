import { after } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { previewImageGenDraft, saveImageGenDraft } from '@/lib/image-gen/draft';
import { claimImageGenJob } from '@/lib/image-gen/jobs';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const access = await editorialRequestAccess(request);
  if (!access) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  const text = await request.text();
  if (text.length > 15000) return Response.json({ error: 'too_large' }, { status: 413, headers });
  try {
    const p = JSON.parse(text);
    if (p.action === 'preview') return Response.json(await previewImageGenDraft(access.uid, p.articleId, p.articleVersion, p.selections), { headers });
    if (p.action !== 'save' || typeof p.previewId !== 'string') throw new Error('invalid');
    const claim = await claimImageGenJob(access.uid, { requestId: p.requestId, articleId: p.articleId,
      articleVersion: p.articleVersion, operation: 'save-draft', parameters: { selections: p.selections, previewId: p.previewId } });
    if (claim.created) after(() => saveImageGenDraft(claim.job));
    return Response.json({ job: claim.job }, { status: claim.created ? 202 : 200, headers });
  } catch { return Response.json({ error: 'Kladden kunne ikke afleveres. Opdatér preview og kontrollér billedvalg og kredit.' }, { status: 409, headers }); }
}
