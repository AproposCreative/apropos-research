import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/seo-engine/secret-guards';
import { runOpportunityScan } from '@/lib/seo-engine/opportunity-engine/engine';
import {
  claimOpportunityCronSlot,
  completeOpportunityCronSlot,
  releaseOpportunityCronSlot,
} from '@/lib/seo-engine/opportunity-engine/store';
import { enqueuePerformanceReviews } from '@/lib/seo-engine/post-publish/performance';
import { logger } from '@/lib/logger';

/** Scheduled collection feeds bounded, independently verified metadata reviews.
 * Queue receipts are not claims of applied CMS changes. */
export async function handleOpportunityCron(
  req: NextRequest,
  cadence: 'daily' | 'weekly'
): Promise<NextResponse> {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const weekKey = `${now.getUTCFullYear()}-W${String(getUtcWeek(now)).padStart(2, '0')}`;
  const slotKey = cadence === 'weekly' ? `weekly:${weekKey}:auto-v1` : `daily:${dayKey}:auto-v1`;

  const claimed = await claimOpportunityCronSlot({
    slotKey,
    ttlHours: cadence === 'weekly' ? 6 * 24 : 20,
  });
  if (!claimed) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `cron slot already claimed (${slotKey})`,
    });
  }

  const mode = 'collect' as const;

  try {
    const report = await runOpportunityScan({
      actor: `system:cron-opportunities:${cadence}`,
      persist: true,
      mode,
      limit: cadence === 'weekly' ? 10 : 40,
    });

    const autoApply = { applied: [] as string[], ...await enqueuePerformanceReviews(report) };

    await completeOpportunityCronSlot({
      slotKey,
      status: 'succeeded',
      detail: `status=${report.status} count=${report.opportunityCount} queued=${autoApply.queued.join(',')} skipped=${autoApply.skipped.length}`,
    });

    return NextResponse.json({
      ok: true,
      slotKey,
      mode,
      status: report.status,
      statusMessage: report.statusMessage,
      opportunityCount: report.opportunityCount,
      appliedCount: autoApply?.applied.length ?? 0,
      queuedCount: autoApply?.queued?.length ?? 0,
      skippedCount: autoApply?.skipped.length ?? 0,
      autoApply,
    });
  } catch (e) {
    // Release lease so the next cron invocation can retry (do not block the rest of the day).
    await releaseOpportunityCronSlot(slotKey).catch(() => undefined);
    logger.error(
      '[cron/seo-engine-opportunities] failed',
      e instanceof Error ? e : new Error(String(e))
    );
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'scan failed', retryable: true },
      { status: 500 }
    );
  }
}

function getUtcWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
