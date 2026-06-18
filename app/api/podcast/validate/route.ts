import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { resolveArticleBySlug } from '@/lib/podcast/resolve-article';
import { slugFromArticleUrl } from '@/lib/podcast/slug-from-url';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  let body: { articleUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Ugyldig JSON' }, { status: 400 });
  }

  const articleUrl = typeof body.articleUrl === 'string' ? body.articleUrl.trim() : '';
  const parsed = slugFromArticleUrl(articleUrl);
  if (parsed.ok === false) {
    return NextResponse.json({ ok: false, error: parsed.error });
  }

  const article = await resolveArticleBySlug(parsed.slug);
  if (!article) {
    return NextResponse.json({
      ok: false,
      error: 'Artikel ikke fundet på aproposmagazine.dk',
    });
  }

  return NextResponse.json({
    ok: true,
    slug: article.slug,
    title: article.title,
    articleUrl: article.articleUrl,
    source: article.source,
  });
}
