import { NextRequest, NextResponse } from 'next/server';
import { runThumbImageOptimization } from '@/lib/webflow/thumb-image-optimizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runThumbImageOptimization({
      offset: Number(body.offset || 0),
      force: !!body.force,
      maxLongEdge: Number(body.maxLongEdge || 2400),
      maxSizeKB: Number(body.maxSizeKB || 450),
      minOriginalKB: Number(body.minOriginalKB || 120),
      limit: Number(body.limit || 10),
      preserveDimensions: body.preserveDimensions === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke optimere desktop-billeder' },
      { status: 500 }
    );
  }
}
