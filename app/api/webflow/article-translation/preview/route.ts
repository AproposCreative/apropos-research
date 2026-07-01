import { NextRequest, NextResponse } from 'next/server';
import { previewArticleTranslationBatch } from '@/lib/webflow/article-translation-batch';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await previewArticleTranslationBatch({
      force: body.force !== false,
      limit: Number(body.limit || 50),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke scanne oversættelser' },
      { status: 500 }
    );
  }
}
