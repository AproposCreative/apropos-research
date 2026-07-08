import { NextRequest, NextResponse } from 'next/server';
import { previewMobileImageOptimization } from '@/lib/webflow/mobile-image-optimizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await previewMobileImageOptimization({
      force: !!body.force,
      maxSizeKB: Number(body.maxSizeKB || 260),
      maxLongEdge: Number(body.maxLongEdge || 1200),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke scanne Mobile Image-felter' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await previewMobileImageOptimization();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke scanne Mobile Image-felter' },
      { status: 500 }
    );
  }
}
