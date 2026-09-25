import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { ensureLivDailyPlan } from '@/lib/liv/daily-plan-store';
import { LIV_DAILY_COLLECTION, livDailyDocId } from '@/lib/liv/daily-history-store';
import { copenhagenClock, addDays, LIV_PLAN_DAYS } from '@/lib/liv/delivery-policy';
import { readDeliveryState, claimPreparation, releasePreparation } from '@/lib/liv/delivery-store';
import { defaultEditorialPlan } from '@/lib/liv/rolling-plan';
import { runLivDaily } from '@/lib/liv/run-daily';
import { admitPreparedArticle, type PreparationProof } from '@/lib/liv/prepared-admission';
import { canRetryUnstartedPreparation } from '@/lib/liv/preparation-retry';
import { canResumeLivPreparationCheckpoint, livPreparationStatusForRow } from '@/lib/liv/preparation-status';
import { claimReserveCandidate } from '@/lib/liv/reserve-preparation';
import { nextScheduledPreparation } from '@/lib/liv/next-preparation';
import { executablePreparation } from '@/lib/liv/preparation-policy';
import { canPrepareReserveFallback } from '@/lib/liv/reserve-fallback-policy';

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
    for (let offset = 0; offset <= LIV_PLAN_DAYS; offset++) {
      await ensureLivDailyPlan(defaultEditorialPlan(addDays(today, offset)));
    }
    const scheduled = await nextScheduledPreparation(state, async (day, scope) =>
      (await db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(day, scope)).get()).data());
    const contentFallback = canPrepareReserveFallback(scheduled);
    const reserveFallback = contentFallback ? await claimReserveCandidate(lease, Date.now(), true) : null;
    if (scheduled && !reserveFallback && !executablePreparation(scheduled.decision) && scheduled.decision.action !== 'reconcile') {
      return NextResponse.json({ ...livPreparationStatusForRow(scheduled.dayKey, scheduled.scope, scheduled.row),
        ...(scheduled.decision.action === 'blocked' ? { status: 'blocked_saved_work' } : {}),
        nextAction: scheduled.decision.action, reasonCode: scheduled.decision.reasonCode });
    }
    const candidates: Array<{ dayKey: string; kind: 'scheduled' | 'reserve'; scope?: 'prepare-alternative' }> = reserveFallback ? [reserveFallback] : scheduled
      ? [{ dayKey: scheduled.dayKey, kind: 'scheduled', ...(scheduled.scope === 'prepare-alternative' ? { scope: scheduled.scope } : {}) }]
      : [];
    if (!candidates.length) {
      const reserve = await claimReserveCandidate(lease);
      if (reserve) candidates.push(reserve);
    }
    for (const candidate of candidates) {
      const scope = candidate.scope || (candidate.kind === 'reserve' ? 'reserve' : 'prepare');
      // Existing paid or uncertain work is retained. Do not start it again merely
      // because this hourly call happened; incomplete jobs appear in health status.
      const saved = await db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(candidate.dayKey, scope)).get();
      if (!saved.exists && scheduled?.decision.action === 'reconcile') {
        return NextResponse.json(livPreparationStatusForRow(candidate.dayKey, scope, scheduled.row));
      }
      if (saved.exists) {
        const row = saved.data();
        if (row?.cmsSaveStarted && row.preparationProof && !row.webflowItemId) {
          const { findPreparedCmsIdentity } = await import('@/lib/liv/recover-cms-identity');
          const recoveredId = await findPreparedCmsIdentity(row.preparationProof);
          if (recoveredId) {
            await db.runTransaction(async tx => {
              const current = (await tx.get(saved.ref)).data();
              if (current?.preparationProof?.hash !== row.preparationProof.hash ||
                current.webflowItemId && current.webflowItemId !== recoveredId) throw new Error('liv_cms_identity_conflict');
              tx.update(saved.ref, { webflowItemId: recoveredId, cmsIdentityRecoveredAt: new Date().toISOString() });
            });
            row.webflowItemId = recoveredId;
          }
        }
        // Reserve job days differ from their delivery dates. Use the saved CMS
        // identity to skip admitted work, including selected/rejected/published
        // items, instead of repeatedly recovering it while the stock is below target.
        if (row?.webflowItemId && (state.entries.some(entry => entry.itemId === row.webflowItemId) ||
            Object.values(state.slots).some(slot => slot.itemId === row.webflowItemId))) {
          if (state.entries.some(entry => entry.itemId === row.webflowItemId && entry.state === 'rejected')) {
            return NextResponse.json(livPreparationStatusForRow(candidate.dayKey, scope, row));
          }
          continue;
        }
        if (row?.webflowItemId && row.preparationProof) {
          const proof = row.preparationProof as PreparationProof;
          try {
            // Re-read the known CMS item; never regenerate text/images or create an item here.
            await admitPreparedArticle({ itemId: row.webflowItemId, slug: proof.expected.slug,
              title: proof.expected.title, kind: candidate.kind,
              scheduledDay: candidate.kind === 'reserve' ? today : candidate.dayKey,
              expiresDay: candidate.kind === 'reserve' ? addDays(candidate.dayKey, 5) : candidate.dayKey }, proof);
            const recovered = await readDeliveryState();
            if (recovered.entries.some(entry => entry.itemId === row.webflowItemId && entry.state === 'ready' &&
                entry.decision !== 'rejected' && entry.expiresDay >= today)) {
              return NextResponse.json({ status: 'recovered_ready_draft', day: candidate.dayKey });
            }
          } catch { /* Retain unready work and expose only a safe blocked status. */ }
          // An immutable payload may already exist without an active manifest
          // entry. A no-op admission is not progress and must never regenerate it.
          return NextResponse.json(livPreparationStatusForRow(candidate.dayKey, scope, row));
        }
        const resumableCheckpoint = canResumeLivPreparationCheckpoint(row);
        if (candidate.kind === 'scheduled' ? !scheduled || !executablePreparation(scheduled.decision)
          : !resumableCheckpoint && !canRetryUnstartedPreparation(row)) {
          return NextResponse.json(livPreparationStatusForRow(candidate.dayKey, scope, row));
        }
      }
      return await runLivDaily(req, { ...candidate, defaultPlan: defaultEditorialPlan(candidate.dayKey, candidate.kind === 'reserve') });
    }
    return NextResponse.json({ status: 'no_unstarted_work', day: today });
  } catch { return NextResponse.json({ error: 'liv_preparation_failed' }, { status: 503 }); }
  finally { if (lease) await releasePreparation(lease).catch(() => {}); }
}
