import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { resolveArticleBySlug } from '@/lib/podcast/resolve-article';
import { incomingAudioPath } from '@/lib/podcast/bucket';
import { assertUploadSize, normalizeAudioContentType } from '@/lib/podcast/signed-upload';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  let body: { slug?: string; contentType?: string; sizeBytes?: number; fileExtension?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!slug) {
    return NextResponse.json({ error: 'Manglende slug' }, { status: 400 });
  }

  const article = await resolveArticleBySlug(slug);
  if (!article) {
    return NextResponse.json({ error: 'Artikel ikke fundet på aproposmagazine.dk' }, { status: 404 });
  }

  const ext = typeof body.fileExtension === 'string' ? body.fileExtension : '.m4a';
  if (ext !== '.m4a' && ext !== '.mp3') {
    return NextResponse.json({ error: 'Kun .m4a og .mp3 er tilladt' }, { status: 400 });
  }

  try {
    assertUploadSize(Number(body.sizeBytes));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ugyldig filstørrelse';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  normalizeAudioContentType(ext, body.contentType);

  const storagePath = incomingAudioPath(slug);
  return NextResponse.json({
    ok: true,
    storagePath,
    /** Legacy alias — client uploader via Firebase SDK til storagePath */
    uploadUrl: storagePath,
  });
}
