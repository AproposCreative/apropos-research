import { NextRequest, NextResponse } from 'next/server';
import { resolveAutoSeoEngineEnabled } from '@/lib/seo-engine/settings';
import { listQueuedSeoEngineJobs } from '@/lib/seo-engine/jobs';
import { enqueueSeoEngineJob } from '@/lib/seo-engine/enqueue';
import { logger } from '@/lib/logger';
import { requireCronSecret } from '@/lib/seo-engine/secret-guards';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Recovery: re-kick queued SEO Engine jobs that never got a worker.
 * Requires CRON_SECRET explicitly (Bearer) — not Firebase tokens.
 */
export async function GET(req: NextRequest) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await resolveAutoSeoEngineEnabled())) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'auto SEO off' });
  }
  try {
    const queued = await listQueuedSeoEngineJobs(15);
    const kicked: string[] = [];
    for (const job of queued) {
      await enqueueSeoEngineJob({
        itemId: job.itemId,
        cmsLastUpdated: job.cmsLastUpdated || 'unknown',
        source: 'recovery',
      });
      kicked.push(job.jobId);
    }
    return NextResponse.json({ ok: true, kicked: kicked.length, jobIds: kicked });
  } catch (e) {
    logger.error(
      '[cron/seo-engine-recovery] failed',
      e instanceof Error ? e : new Error(String(e))
    );
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'recovery failed' },
      { status: 500 }
    );
  }
}
