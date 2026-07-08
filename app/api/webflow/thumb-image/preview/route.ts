import { NextRequest, NextResponse } from 'next/server';
import { previewThumbImageOptimization } from '@/lib/webflow/thumb-image-optimizer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await previewThumbImageOptimization({
      force: !!body.force,
      maxSizeKB: Number(body.maxSizeKB || 600),
      minOriginalKB: Number(body.minOriginalKB || 120),
      limit: Number(body.limit || 10),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Kunne ikke scanne desktop-billeder' },
      { status: 500 }
    );
  }
}
