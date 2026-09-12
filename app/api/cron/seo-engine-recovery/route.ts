import { after, NextRequest, NextResponse } from 'next/server';
import { listRecoverableQualityJobs } from '@/lib/seo-engine/post-publish/jobs';
import { runProductionQualityJob } from '@/lib/seo-engine/post-publish/runtime';
import { resolveAutoSeoEngineEnabled } from '@/lib/seo-engine/settings';
import { listQueuedSeoEngineJobs } from '@/lib/seo-engine/jobs';
import { kickSeoEngineJob } from '@/lib/seo-engine/enqueue';
import { resolveAutomaticOpportunityRuntime } from '@/lib/seo-engine/opportunity-engine/settings';
import { logger } from '@/lib/logger';
import { requireCronSecret } from '@/lib/seo-engine/secret-guards';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Recovery: re-kick queued SEO Engine jobs that never got a worker.
 * Requires CRON_SECRET explicitly (Bearer) — not Firebase tokens.
 */
export async function GET(req: NextRequest) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const qualityJobs = await listRecoverableQualityJobs(2);
    // Awaited background work is bounded by this route's duration. Each worker
    // handles its own gate, including read-only reconciliation while stopped.
    after(async () => {
      const outcomes = await Promise.allSettled(qualityJobs.map(runProductionQualityJob));
      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'rejected') logger.warn('[seo-quality] recovery worker failed', { jobId: qualityJobs[index] });
      });
    });
    const runtime = await resolveAutomaticOpportunityRuntime();
    const legacy = await resolveAutoSeoEngineEnabled();
    if (!runtime.killSwitchEnabled || !(runtime.shouldAutoFillOnPublish || legacy)) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'auto SEO off', qualityJobs });
    }
    const queued = await listQueuedSeoEngineJobs(15);
    const kicked: string[] = [];
    for (const job of queued) {
      kickSeoEngineJob({
        itemId: job.itemId,
        jobId: job.jobId,
      });
      kicked.push(job.jobId);
    }
    return NextResponse.json({ ok: true, kicked: kicked.length, jobIds: kicked, qualityJobs });
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
