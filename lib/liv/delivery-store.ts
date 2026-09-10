import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { eligibleEntries, emptyDeliveryState, LIV_DELIVERY_LEASE_MS, validDay, copenhagenClock, addDays,
  type DeliveryState, type ReadyEntry, type DeliverySlot } from '@/lib/liv/delivery-policy';

const COLLECTION = 'livDelivery';
function database() {
  const db = getAdminDb();
  if (!db) throw new Error('liv_delivery_store_unavailable');
  return db;
}
export async function readDeliveryState(): Promise<DeliveryState> {
  return (await database().collection(COLLECTION).doc('manifest').get()).data() as DeliveryState || emptyDeliveryState();
}
/** One manifest serializes selection and item/day ownership; large payloads are separate immutable documents. */
export async function mutateDelivery<T>(change: (state: DeliveryState) => T): Promise<T> {
  const db = database();
  const ref = db.collection(COLLECTION).doc('manifest');
  return db.runTransaction(async tx => {
    const state = (await tx.get(ref)).data() as DeliveryState || emptyDeliveryState();
    const result = change(state);
    tx.set(ref, state);
    return result;
  });
}
export async function enqueueReadyArticle(entry: Omit<ReadyEntry, 'state' | 'payloadHash' | 'preparedAt'>,
  expected: WebflowArticleFields) {
  if (!/^[a-f0-9]{24}$/i.test(entry.itemId) || !validDay(entry.scheduledDay) || !validDay(entry.expiresDay) ||
      entry.expiresDay < entry.scheduledDay || entry.slug !== expected.slug || entry.title !== expected.title) {
    throw new Error('liv_delivery_invalid_entry');
  }
  const payloadHash = cmsFieldHash(expected as unknown as Record<string, unknown>);
  const db = database();
  const manifest = db.collection(COLLECTION).doc('manifest');
  const payload = db.collection(COLLECTION).doc(`item-${entry.itemId}`);
  const slugRef = db.collection(COLLECTION).doc(`slug-${cmsFieldHash({ slug: entry.slug })}`);
  await db.runTransaction(async tx => {
    const state = (await tx.get(manifest)).data() as DeliveryState || emptyDeliveryState();
    const oldPayload = (await tx.get(payload)).data();
    const slugUsed = (await tx.get(slugRef)).exists;
    if (oldPayload?.payloadHash === payloadHash) return;
    if (oldPayload || slugUsed) throw new Error('liv_delivery_duplicate_or_changed');
    const previous = state.entries.find(e => e.itemId === entry.itemId || e.slug === entry.slug);
    if (previous) {
      if (previous.itemId === entry.itemId && previous.payloadHash === payloadHash) return;
      throw new Error('liv_delivery_duplicate_or_changed');
    }
    // Archive expired unselected work and old completed receipts. Immutable item
    // and slug tombstones remain, so compaction cannot re-enable a duplicate.
    const today = copenhagenClock().day;
    const cutoff = addDays(today, -14);
    state.entries = state.entries.filter(e => !((['ready', 'rejected'].includes(e.state) && e.expiresDay < today) ||
      (e.state === 'published' && e.expiresDay < cutoff)));
    for (const [day, slot] of Object.entries(state.slots)) {
      if (slot.state === 'published' && day < cutoff) {
        tx.set(db.collection(COLLECTION).doc(`receipt-${day}`), slot);
        delete state.slots[day];
      }
    }
    // Never silently discard an ambiguous item.
    if (state.entries.length >= 100) throw new Error('liv_delivery_archive_required');
    state.entries.push({ ...entry, state: 'ready', payloadHash, preparedAt: new Date().toISOString() });
    tx.create(payload, { expected: JSON.parse(JSON.stringify(expected)), payloadHash });
    tx.create(slugRef, { itemId: entry.itemId });
    tx.set(manifest, state);
  });
}
export async function readDeliveryPayload(itemId: string) {
  if (!/^[a-f0-9]{24}$/i.test(itemId)) throw new Error('liv_delivery_invalid_item');
  const row = (await database().collection(COLLECTION).doc(`item-${itemId}`).get()).data();
  if (!row?.expected || cmsFieldHash(row.expected) !== row.payloadHash) throw new Error('liv_delivery_payload_changed');
  return row.expected as WebflowArticleFields;
}

export function selectDelivery(state: DeliveryState, day: string, now: number, token: string): DeliverySlot | null {
  if (!validDay(day)) throw new Error('liv_delivery_invalid_day');
  // A pre-write job from an earlier day cannot be published late. Expired
  // workers lose their token; ambiguous external writes are never discarded.
  for (const [previousDay, previous] of Object.entries(state.slots)) {
    if (previousDay < day && previous.state === 'selected' && previous.leaseUntil <= now) {
      const entry = state.entries.find(e => e.itemId === previous.itemId);
      if (entry) entry.state = 'rejected';
      delete state.slots[previousDay];
    }
  }
  // An ambiguous write also blocks subsequent days: reconcile it before selecting any other item.
  const uncertain = Object.entries(state.slots).find(([, s]) => s.state === 'attempted');
  if (uncertain && uncertain[0] !== day) return null;
  const slot = state.slots[day];
  if (slot?.state === 'published' || (slot && (slot.leaseUntil > now || slot.nextAttemptAt > now))) return null;
  if (slot) {
    slot.token = token;
    slot.leaseUntil = now + LIV_DELIVERY_LEASE_MS;
    slot.attempts += 1;
    return { ...slot };
  }
  const candidate = eligibleEntries(state, day)[0];
  if (!candidate) return null;
  candidate.state = 'selected';
  state.slots[day] = { itemId: candidate.itemId, token, state: 'selected', leaseUntil: now + LIV_DELIVERY_LEASE_MS,
    nextAttemptAt: 0, attempts: 1 };
  return { ...state.slots[day] };
}
export async function claimDelivery(day: string, now = Date.now()) {
  const db = database();
  const ref = db.collection(COLLECTION).doc('manifest');
  const token = randomUUID();
  return db.runTransaction(async tx => {
    const state = (await tx.get(ref)).data() as DeliveryState || emptyDeliveryState();
    const legacy = (await tx.get(db.collection('livDailyArticles').doc(`daily-${day}`))).data();
    // Migration guard: an older deployment may already have published or saved
    // today's item. Never start a second one until that run is reconciled.
    if (legacy && legacy.status !== 'skipped_no_topic' && !state.slots[day]) return null;
    const slot = selectDelivery(state, day, now, token);
    tx.set(ref, state);
    return slot;
  });
}
export async function updateDelivery(day: string, token: string,
  change: (slot: DeliverySlot, state: DeliveryState) => void) {
  return mutateDelivery(state => {
    const slot = state.slots[day];
    if (!slot || slot.token !== token) throw new Error('liv_delivery_lease_lost');
    change(slot, state);
  });
}

export async function claimPreparation(now = Date.now()) {
  const token = randomUUID();
  return mutateDelivery(state => {
    if (state.preparation && state.preparation.leaseUntil > now) return null;
    state.preparation = { token, leaseUntil: now + LIV_DELIVERY_LEASE_MS };
    return token;
  });
}
export async function releasePreparation(token: string) {
  return mutateDelivery(state => {
    if (state.preparation?.token === token) delete state.preparation;
  });
}
