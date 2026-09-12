import { NextRequest, NextResponse } from 'next/server';
import { requireInternalApiSecret } from '@/lib/seo-engine/secret-guards';
import { runProductionQualityJob } from '@/lib/seo-engine/post-publish/runtime';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  if (!requireInternalApiSecret(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.jobId !== 'string' || !/^[a-f0-9]{64}$/.test(body.jobId)) {
    return NextResponse.json({ ok: false, error: 'Invalid jobId' }, { status: 400 });
  }
  try { return NextResponse.json(await runProductionQualityJob(body.jobId)); }
  catch { return NextResponse.json({ ok: false, error: 'SEO quality worker failed' }, { status: 500 }); }
}
