import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/seo-engine/secret-guards';
import { runOpportunityScan } from '@/lib/seo-engine/opportunity-engine/engine';
import { maybeAutoApplyOpportunities } from '@/lib/seo-engine/opportunity-engine/apply';
import { claimOpportunityCronSlot } from '@/lib/seo-engine/opportunity-engine/store';
import { logger } from '@/lib/logger';

/**
 * Idempotent daily collect / weekly optimize.
 * Daily: gather GSC/GA4 opportunities (no writes).
 * Weekly: optimize — auto-apply up to 10 with guardrails.
 */
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
  const slotKey = cadence === 'weekly' ? `weekly:${weekKey}` : `daily:${dayKey}`;

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

  const mode = cadence === 'weekly' ? 'optimize' : 'collect';

  try {
    const report = await runOpportunityScan({
      actor: `system:cron-opportunities:${cadence}`,
      persist: true,
      mode,
      limit: cadence === 'weekly' ? 10 : 40,
    });

    let autoApply: { applied: string[]; skipped: Array<{ id: string; reason: string }> } | null =
      null;
    if (cadence === 'weekly' && report.status !== 'auto_disabled' && report.status !== 'missing_gsc') {
      autoApply = await maybeAutoApplyOpportunities({
        opportunities: report.opportunities,
        actor: `system:cron-opportunities:${cadence}`,
      });
    }

    return NextResponse.json({
      ok: true,
      slotKey,
      mode,
      status: report.status,
      statusMessage: report.statusMessage,
      opportunityCount: report.opportunityCount,
      appliedCount: autoApply?.applied.length ?? 0,
      skippedCount: autoApply?.skipped.length ?? 0,
      autoApply,
    });
  } catch (e) {
    // Fail closed for the cron itself — never affects article publish path.
    logger.error(
      '[cron/seo-engine-opportunities] failed',
      e instanceof Error ? e : new Error(String(e))
    );
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'scan failed' },
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
