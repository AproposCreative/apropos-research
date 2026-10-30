import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { draftIdentitySchema, draftSaveSchema } from '@/lib/social/editor-draft';
import { lastSocialArticle, readSocialDraft, saveSocialDraft } from '@/lib/social/draft-store';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return NextResponse.json({ error: 'Log ind som redaktør.' }, { status: 401, headers });
  try {
    if (!req.nextUrl.searchParams.has('articleId')) return NextResponse.json({ lastArticleId: await lastSocialArticle(access.uid) }, { headers });
    const parsed = draftIdentitySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Ugyldig artikelversion.' }, { status: 400, headers });
    return NextResponse.json(await readSocialDraft(access.uid, parsed.data.articleId, parsed.data.sourceHash), { headers });
  } catch {
    return NextResponse.json({ error: 'Den gemte kladde kunne ikke hentes.' }, { status: 503, headers });
  }
}
export async function PUT(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return NextResponse.json({ error: 'Log ind som redaktør.' }, { status: 401, headers });
  const parsed = draftSaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Kladde eller artikelversion er ugyldig.' }, { status: 400, headers });
  try {
    const { articleId, sourceHash, expectedRevision, draft } = parsed.data;
    const result = await saveSocialDraft(access.uid, articleId, sourceHash, expectedRevision, draft);
    return NextResponse.json(result.record, { status: result.conflict ? 409 : 200, headers });
  } catch {
    return NextResponse.json({ error: 'Kladde kunne ikke gemmes på serveren.' }, { status: 503, headers });
  }
}
