import { getAdminDb } from '@/lib/firebase-admin';
import { inspectLivCmsDraft } from './cms-readback';
import { cmsFieldHash } from './cms-field-hash';
import { addDays, copenhagenClock, type DeliveryState } from './delivery-policy';
import { nextScheduledPreparation } from './next-preparation';
import { canPrepareReserveFallback } from './reserve-fallback-policy';
import { editorialPlanHash } from './rolling-plan';
import { livDailyDocId } from './daily-history-store';
import type { LivDailyPlan } from './daily-plan-store';

/** Reuse an admitted reserve after exhausted content candidates. No generation,
 * publication or reset. Re-read CMS, then atomically bind the unchanged payload
 * to tomorrow's plan. Retain failed runs and an immutable scheduling audit. */
export async function scheduleReadyReserve(lease: string, now = Date.now()) {
  const db = getAdminDb(); if (!db) throw Error('liv_reserve_store_unavailable');
  const manifest = db.collection('livDelivery').doc('manifest');
  const initial = (await manifest.get()).data() as DeliveryState | undefined;
  if (!initial) return null;
  const tomorrow = addDays(copenhagenClock(new Date(now)).day, 1);
  const candidate = initial.entries.filter(e => e.kind === 'reserve' && e.state === 'ready' &&
    e.scheduledDay <= tomorrow && e.expiresDay >= tomorrow && !e.publicationBlockers?.length &&
    e.decision !== 'rejected' && !Object.values(initial.slots).some(s => s.itemId === e.itemId))
    .sort((a,b) => Number(b.decision === 'approved') - Number(a.decision === 'approved') || a.preparedAt.localeCompare(b.preparedAt))[0];
  if (!candidate) return null;
  const payloadRef = db.collection('livDelivery').doc(`item-${candidate.itemId}`);
  const payload = (await payloadRef.get()).data();
  if (!payload?.expected || payload.payloadHash !== candidate.payloadHash ||
    cmsFieldHash(payload.expected) !== candidate.payloadHash) throw Error('liv_delivery_payload_changed');
  const inspected = await inspectLivCmsDraft({ itemId: candidate.itemId, expected: payload.expected });
  if (!inspected.draftConfirmed || !inspected.publicationReady || !inspected.checks.length ||
    inspected.checks.some(c => !c.ok)) return null;
  return db.runTransaction(async tx => {
    const state = (await tx.get(manifest)).data() as DeliveryState | undefined;
    if (!state?.preparation || state.preparation.token !== lease || state.preparation.leaseUntil <= Date.now() ||
      !Number.isFinite(state.preparation.leaseUntil)) throw Error('liv_reserve_lease_lost');
    if (state.coverRevision || state.slots[tomorrow] || Object.values(state.slots).some(s => s.state === 'attempted')) return null;
    const entry = state.entries.find(e => e.itemId === candidate.itemId);
    if (!entry || cmsFieldHash({ ...entry }) !== cmsFieldHash({ ...candidate })) return null;
    const currentPayload = (await tx.get(payloadRef)).data();
    if (!currentPayload?.expected || currentPayload.payloadHash !== candidate.payloadHash ||
      cmsFieldHash(currentPayload.expected) !== candidate.payloadHash) throw Error('liv_delivery_payload_changed');
    const selection = await nextScheduledPreparation(state, async (day, scope) =>
      (await tx.get(db.collection('livDailyArticles').doc(livDailyDocId(day, scope)))).data(), new Date(now));
    if (selection?.dayKey !== tomorrow || !canPrepareReserveFallback(selection)) return null;
    const plan = (await tx.get(db.collection('livDailyPlan').doc(`plan-${tomorrow}`))).data() as LivDailyPlan | undefined;
    if (!plan || plan.dayKey !== tomorrow || !['pending', 'failed'].includes(plan.status)) return null;
    const receipt = db.collection('livReserveAssignments').doc(`${tomorrow}-${entry.itemId}`);
    if ((await tx.get(receipt)).exists) return null;
    const previous = { ...entry };
    entry.kind = 'scheduled'; entry.scheduledDay = tomorrow;
    entry.planHash = editorialPlanHash(plan);
    tx.create(receipt, { day: tomorrow, itemId: entry.itemId, previous, assigned: { ...entry },
      reason: 'content_candidates_exhausted', failedRunId: livDailyDocId(tomorrow, selection.scope),
      failedRunHash: cmsFieldHash(selection.row || {}), planHash: entry.planHash,
      cmsReadbackPassed: true, assignedAt: new Date(now).toISOString() });
    tx.set(manifest, state);
    return { status: 'reserve_scheduled' as const, day: tomorrow, itemId: entry.itemId };
  });
}
