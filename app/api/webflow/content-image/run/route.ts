import { NextRequest, NextResponse } from 'next/server';
import { runContentImageOptimization } from '@/lib/webflow/content-image-optimizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runContentImageOptimization({
      force: !!body.force,
      maxSizeKB: Number(body.maxSizeKB || 200),
      maxLongEdge: Number(body.maxLongEdge || 1200),
      minOriginalKB: Number(body.minOriginalKB ?? 80),
      articleLimit: Number(body.articleLimit || 5),
      imagesPerArticle: Number(body.imagesPerArticle || 5),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke optimere brødtekst-billeder' },
      { status: 500 }
    );
  }
}
