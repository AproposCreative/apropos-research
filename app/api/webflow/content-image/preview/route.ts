import { NextRequest, NextResponse } from 'next/server';
import { previewContentImageOptimization } from '@/lib/webflow/content-image-optimizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await previewContentImageOptimization({
      force: !!body.force,
      maxSizeKB: Number(body.maxSizeKB || 200),
      maxLongEdge: Number(body.maxLongEdge || 1200),
      minOriginalKB: Number(body.minOriginalKB ?? 80),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke scanne brødtekst-billeder' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await previewContentImageOptimization();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke scanne brødtekst-billeder' },
      { status: 500 }
    );
  }
}
