import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { addDays, copenhagenClock, type DeliveryState } from './delivery-policy';
import { explicitPreparationInput } from './explicit-preparation';
import { cmsFieldHash } from './cms-field-hash';
import { LIV_DAILY_COLLECTION, livDailyDocId } from './daily-history-store';
import { LIV_DAILY_PLAN_COLLECTION } from './daily-plan-store';
import { decidePreparation } from './preparation-policy';

const unpaidMissKeys = new Set(['dayKey', 'reason', 'topic', 'gateResults', 'preparationAttempts',
  'completedAt', 'status', 'updatedAt']);
function unpaidTopicMiss(row: Record<string, unknown> | undefined, now: number) {
  return !!row && row.status === 'skipped_no_topic' && !row.topic &&
    Object.keys(row).every(key => unpaidMissKeys.has(key)) &&
    decidePreparation(row, now).reasonCode === 'source_retry_scheduled';
}

// Reuse the editorial validation, but do not create a reserve or invoke AI here.
const planInput = z.object({
  dayKey: explicitPreparationInput.shape.dayKey,
  topicHint: explicitPreparationInput.shape.topicHint,
  directiveHint: explicitPreparationInput.shape.directiveHint,
  articleFormat: explicitPreparationInput.shape.articleFormat,
  editorialKind: explicitPreparationInput.shape.editorialKind,
}).strict().refine(p => p.editorialKind === undefined || p.articleFormat === 'article');
export const queuePlanInput = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  plans: z.array(planInput).min(1).max(3),
}).strict().refine(input => new Set(input.plans.map(p => p.dayKey)).size === input.plans.length);

/** One explicit batch, not a permanent larger paid inventory target. Transaction
 * and worker share the preparation lease; no existing paid identity is reset. */
export async function scheduleLivQueue(value: unknown, lease: string, now = Date.now()) {
  const parsed = queuePlanInput.safeParse(value);
  if (!parsed.success) throw new Error('liv_queue_invalid');
  const input = parsed.data;
  const inputHash = cmsFieldHash(input);
  const db = getAdminDb();
  if (!db) throw new Error('liv_queue_store_unavailable');
  const manifest = db.collection('livDelivery').doc('manifest');
  const receipt = db.collection('livQueuePlans').doc(input.requestId);
  return db.runTransaction(async tx => {
    const state = (await tx.get(manifest)).data() as DeliveryState | undefined;
    const saved = (await tx.get(receipt)).data();
    if (saved) {
      if (saved.inputHash !== inputHash) throw new Error('liv_queue_conflict');
      return { status: 'already_scheduled', days: input.plans.map(p => p.dayKey) };
    }
    if (!state?.preparation || state.preparation.token !== lease ||
      !Number.isFinite(state.preparation.leaseUntil) || state.preparation.leaseUntil <= now) throw new Error('liv_queue_lease_lost');
    if (state.coverRevision || Object.values(state.slots).some(s => s.state === 'attempted')) throw new Error('liv_queue_delivery_hold');
    const today = copenhagenClock(new Date(now)).day;
    const previousPlans = [];
    for (const plan of input.plans) {
      if (plan.dayKey <= today || plan.dayKey > addDays(today, 7)) throw new Error('liv_queue_invalid');
      if (state.slots[plan.dayKey] || state.entries.some(e => e.scheduledDay === plan.dayKey)) throw new Error('liv_queue_occupied');
      // All run namespaces matter, even failed runs or identity-only seeds.
      let primaryUnpaidMiss = false;
      for (const scope of ['daily', 'prepare', 'prepare-alternative', 'reserve', 'reserve-editorial'] as const) {
        const snap = await tx.get(db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(plan.dayKey, scope)));
        if (scope === 'prepare') primaryUnpaidMiss = unpaidTopicMiss(snap.data(), now);
        if (snap.exists && !(scope === 'prepare' && primaryUnpaidMiss)) {
          throw new Error('liv_queue_occupied');
        }
      }
      const ref = db.collection(LIV_DAILY_PLAN_COLLECTION).doc(`plan-${plan.dayKey}`);
      const previous = (await tx.get(ref)).data();
      // Old missing-topic attempts created a failure marker, not an editorial
      // plan. Archive that marker; keep the exact run/counters for shared retry.
      const bareFailure = primaryUnpaidMiss && previous?.status === 'failed' &&
        Object.keys(previous).every(key => ['status', 'failedReason', 'updatedAt'].includes(key));
      if (previous && !bareFailure && (previous.createdBy !== 'liv-rolling-plan' || previous.status !== 'pending')) throw new Error('liv_queue_conflict');
      previousPlans.push({ dayKey: plan.dayKey, plan: previous ?? null });
    }
    const days = [...new Set([...(state.editorialPreparationDays ?? []).filter(d => d >= today),
      ...input.plans.map(p => p.dayKey)])].sort();
    if (days.length > 3) throw new Error('liv_queue_limit');
    // All reads precede all writes. Paid work, slots and other plans untouched.
    for (const plan of input.plans) tx.set(db.collection(LIV_DAILY_PLAN_COLLECTION).doc(`plan-${plan.dayKey}`), {
      ...plan, mustUseTrending: false, status: 'pending', createdBy: 'liv-queue-operations',
      queueRequestId: input.requestId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(manifest, { editorialPreparationDays: days });
    tx.create(receipt, { input, inputHash, previousPlans, createdAt: FieldValue.serverTimestamp() });
    return { status: 'scheduled', days: input.plans.map(p => p.dayKey) };
  });
}
