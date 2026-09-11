import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { ensureLivDailyPlan } from '@/lib/liv/daily-plan-store';
import { LIV_DAILY_COLLECTION, livDailyDocId } from '@/lib/liv/daily-history-store';
import { copenhagenClock, addDays, LIV_PLAN_DAYS } from '@/lib/liv/delivery-policy';
import { readDeliveryState, claimPreparation, releasePreparation } from '@/lib/liv/delivery-store';
import { defaultEditorialPlan, preparationCandidates } from '@/lib/liv/rolling-plan';
import { runLivDaily } from '@/lib/liv/run-daily';
import { admitPreparedArticle, type PreparationProof } from '@/lib/liv/prepared-admission';
import { canRetryUnstartedPreparation } from '@/lib/liv/preparation-retry';

export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_PREPARE_ENABLED !== 'true' ||
    ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase())) {
    return NextResponse.json({ status: 'disabled' });
  }
  if (req.nextUrl.searchParams.has('dryRun')) return NextResponse.json({ status: 'dry_run_no_writes' });
  let lease: string | null = null;
  try {
    lease = await claimPreparation();
    if (!lease) return NextResponse.json({ status: 'already_preparing' });
    const db = getAdminDb();
    if (!db) throw new Error('liv_delivery_store_unavailable');
    const today = copenhagenClock().day;
    const state = await readDeliveryState();
    for (let offset = 1; offset <= LIV_PLAN_DAYS; offset++) {
      await ensureLivDailyPlan(defaultEditorialPlan(addDays(today, offset)));
    }
    for (const candidate of preparationCandidates(state, today)) {
      const scope = candidate.kind === 'reserve' ? 'reserve' : 'prepare';
      // Existing paid or uncertain work is retained. Do not start it again merely
      // because this hourly call happened; incomplete jobs appear in health status.
      const saved = await db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(candidate.dayKey, scope)).get();
      if (saved.exists) {
        const row = saved.data();
        if (row?.webflowItemId && row.preparationProof) {
          const proof = row.preparationProof as PreparationProof;
          try {
            // Re-read the known CMS item; never regenerate text/images or create an item here.
            await admitPreparedArticle({ itemId: row.webflowItemId, slug: proof.expected.slug,
              title: proof.expected.title, kind: candidate.kind,
              scheduledDay: scope === 'reserve' ? today : candidate.dayKey,
              expiresDay: scope === 'reserve' ? addDays(candidate.dayKey, 5) : candidate.dayKey }, proof);
            return NextResponse.json({ status: 'recovered_ready_draft', day: candidate.dayKey });
          } catch { /* Unready work is retained; try another candidate instead. */ }
        }
        const resumableCheckpoint = Array.isArray(row?.articleCheckpoint?.preparedMedia) && row.articleCheckpoint.preparedMedia.length >= 3 &&
          !row?.webflowItemId && !row?.preparationProof;
        if (!resumableCheckpoint && !canRetryUnstartedPreparation(row)) continue;
      }
      return await runLivDaily(req, { ...candidate, defaultPlan: defaultEditorialPlan(candidate.dayKey, scope === 'reserve') });
    }
    return NextResponse.json({ status: 'no_unstarted_work', day: today });
  } catch { return NextResponse.json({ error: 'liv_preparation_failed' }, { status: 503 }); }
  finally { if (lease) await releasePreparation(lease).catch(() => {}); }
}
