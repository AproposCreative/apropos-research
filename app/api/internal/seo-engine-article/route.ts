import { NextRequest, NextResponse } from 'next/server';
import { runSeoEngineJob } from '@/lib/seo-engine/auto-seo-worker';
import { logger } from '@/lib/logger';
import { requireInternalApiSecret } from '@/lib/seo-engine/secret-guards';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!requireInternalApiSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as { jobId?: string; itemId?: string };
    const jobId = String(body.jobId || '').trim();
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'jobId er påkrævet' }, { status: 400 });
    }
    const result = await runSeoEngineJob(jobId);
    return NextResponse.json({ ...result, itemId: body.itemId || null });
  } catch (e) {
    logger.error(
      '[internal/seo-engine-article] failed',
      e instanceof Error ? e : new Error(String(e))
    );
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'SEO Engine job fejlede' },
      { status: 500 }
    );
  }
}
