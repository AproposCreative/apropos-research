import { NextRequest, NextResponse } from 'next/server';
import { runArticleTranslationBatch } from '@/lib/webflow/article-translation-batch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runArticleTranslationBatch({
      force: body.force !== false,
      articleLimit: Number(body.articleLimit || 3),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke køre oversættelser' },
      { status: 500 }
    );
  }
}
