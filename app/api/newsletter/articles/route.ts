import { NextRequest, NextResponse } from 'next/server';
import { authorizeNewsletterRequest } from '@/lib/newsletter/auth-request';
import { env } from '@/lib/config/env';
import { listNewsletterArticlesForPicker } from '@/lib/newsletter/webflow-sources';

export async function GET(req: NextRequest) {
  if (!(await authorizeNewsletterRequest(req))) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const baseUrl = env.NEWSLETTER_ARTICLE_BASE_URL || 'https://www.aproposmagazine.com';
    const { searchParams } = req.nextUrl;
    const q = typeof searchParams.get('q') === 'string' ? searchParams.get('q')! : undefined;
    const limitRaw = searchParams.get('limit');
    const limit =
      limitRaw !== null && limitRaw !== '' ? Math.min(150, Math.max(1, Number.parseInt(limitRaw, 10) || 100)) : 100;

    const { items, error } = await listNewsletterArticlesForPicker({
      articleBaseUrl: baseUrl,
      query: q,
      limit,
    });

    if (error && items.length === 0) {
      return NextResponse.json({ error, items: [] }, { status: 502 });
    }

    return NextResponse.json({ items, error: error || null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl', items: [] },
      { status: 500 }
    );
  }
}
