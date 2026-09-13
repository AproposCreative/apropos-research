import { getAdminDb } from '@/lib/firebase-admin';
import { LIV_DAILY_COLLECTION, livDailyDocId } from './daily-history-store';
import { addDays, copenhagenClock, eligibleEntries, reserveTarget, validDay, type DeliveryState } from './delivery-policy';
import { preparationCandidates } from './rolling-plan';

/** A reserve is lower priority than both today's delivery and tomorrow's story. */
export function reserveNeeded(state: DeliveryState, today: string) {
  if (!reserveTarget() || state.coverRevision || Object.values(state.slots).some(s => s.state === 'attempted')) return false;
  if (preparationCandidates(state, today).length) return false;
  if (!state.slots[today] && !eligibleEntries(state,today).length) return false;
  const tomorrow = addDays(today,1);
  if (!state.slots[tomorrow] && !state.entries.some(e => e.kind === 'scheduled' && e.scheduledDay === tomorrow &&
      e.expiresDay >= tomorrow && !e.publicationBlockers?.length && e.decision !== 'rejected' && ['ready','selected','published'].includes(e.state))) return false;
  // Even a blocked/rejected reserve is retained for explicit resolution, not replaced for money.
  return !state.entries.some(e => e.kind === 'reserve' && e.expiresDay >= today && e.state !== 'published');
}

/** Called only inside the authenticated shared preparation lease. No model/CMS calls. */
export async function claimReserveCandidate(lease: string, now = Date.now()) {
  if (!reserveTarget()) return null;
  const db = getAdminDb(); if (!db) throw new Error('liv_reserve_store_unavailable');
  const manifest = db.collection('livDelivery').doc('manifest');
  const today = copenhagenClock(new Date(now)).day;
  return db.runTransaction(async tx => {
    const state = (await tx.get(manifest)).data() as DeliveryState | undefined;
    if (!state?.preparation || state.preparation.token !== lease || state.preparation.leaseUntil <= now ||
        !Number.isFinite(state.preparation.leaseUntil)) throw new Error('liv_reserve_lease_lost');
    if (!reserveNeeded(state,today)) return null;
    let dayKey = state.reservePreparation?.dayKey ?? today;
    if (!validDay(dayKey) || dayKey > today) throw new Error('liv_reserve_pointer_invalid');
    const row = (await tx.get(db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey,'reserve')))).data();
    // Only an admitted completed/expired item permits replenishment. Failed or
    // ambiguous jobs keep the pointer forever until explicitly resolved.
    if (row?.webflowItemId) {
      const entry = state.entries.find(e => e.itemId === row.webflowItemId);
      const published = Object.values(state.slots).some(s => s.itemId === row.webflowItemId && s.state === 'published');
      const retired = published || entry?.state === 'published' || entry && entry.expiresDay < today;
      if (retired) {
        if (dayKey === today) return null; // never generate twice in one reserve namespace/day
        dayKey = today;
      }
    }
    if (state.reservePreparation?.dayKey !== dayKey) {
      tx.set(manifest,{...state,reservePreparation:{dayKey}});
    }
    return { dayKey, kind: 'reserve' as const };
  });
}
