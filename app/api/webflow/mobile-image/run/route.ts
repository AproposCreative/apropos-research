import { NextRequest, NextResponse } from 'next/server';
import { runMobileImageOptimization } from '@/lib/webflow/mobile-image-optimizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runMobileImageOptimization({
      force: !!body.force,
      maxSizeKB: Number(body.maxSizeKB || 160),
      maxLongEdge: Number(body.maxLongEdge || 800),
      limit: Number(body.limit || 10),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke optimere Mobile Image-felter' },
      { status: 500 }
    );
  }
}
