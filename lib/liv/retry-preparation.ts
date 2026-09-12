import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { LIV_DAILY_COLLECTION, livDailyDocId } from '@/lib/liv/daily-history-store';
import { validDay } from '@/lib/liv/delivery-policy';

export type PreparationRetry = { dayKey: string; kind: 'scheduled' | 'reserve'; requestId: string; reason: string;
  plan?: { topicHint: string; directiveHint: string }; resumeWritingRunId?: string; scope?: 'prepare-alternative' };

/** Explicit operator retry, not a reset. Retain the full previous run and paid
 * checkpoints. A replayed request never grants a second attempt. CMS writes
 * with uncertain outcomes must use reconciliation, never this operation. */
export async function authorizePreparationRetry(input: PreparationRetry) {
  if (!validDay(input.dayKey) || !['scheduled', 'reserve'].includes(input.kind) ||
    (input.scope !== undefined && (input.scope !== 'prepare-alternative' || input.kind !== 'scheduled' || input.plan)) ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) || !input.reason?.trim() || input.reason.length > 500) {
    throw new Error('liv_retry_invalid');
  }
  if (input.plan && (input.kind !== 'scheduled' || typeof input.plan.topicHint !== 'string' ||
    typeof input.plan.directiveHint !== 'string' || input.plan.topicHint.length > 500 || input.plan.directiveHint.length > 6000)) {
    throw new Error('liv_retry_invalid');
  }
  if (input.resumeWritingRunId && (input.plan || !/^[a-f0-9-]{36}$/.test(input.resumeWritingRunId))) {
    throw new Error('liv_retry_invalid');
  }
  const db = getAdminDb();
  if (!db) throw new Error('liv_retry_store_unavailable');
  const scope = input.kind === 'reserve' ? 'reserve' : input.scope || 'prepare';
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(input.dayKey, scope));
  const audit = ref.collection('retryRequests').doc(createHash('sha256').update(input.requestId).digest('hex'));
  const planRef = db.collection('livDailyPlan').doc(`plan-${input.dayKey}`);
  return db.runTransaction(async tx => {
    const previous = await tx.get(audit);
    const row = (await tx.get(ref)).data();
    const previousPlan = input.plan ? (await tx.get(planRef)).data() : null;
    if (previous.exists) return { status: 'already_requested' as const };
    if (!row || row.status === 'published' || row.status === 'draft' || row.webflowItemId ||
      row.preparationProof || row.cmsSaveStarted || row.retryAuthorization || row.continuationReady) {
      throw new Error('liv_retry_conflict');
    }
    if (input.plan && (row.articleCheckpoint || row.articleCheckpointHash)) throw new Error('liv_retry_conflict');
    if (input.resumeWritingRunId && (row.articleCheckpoint || !row.topic)) throw new Error('liv_retry_conflict');
    // A live worker owns its run, including the gap before its first checkpoint.
    if (row.status === 'processing' && Date.now() - (row.processingStartedAt?.toMillis?.() || 0) < 25 * 60_000) {
      throw new Error('liv_retry_processing');
    }
    tx.create(audit, { reason: input.reason.trim(), previous: row, previousPlan: previousPlan ?? null,
      requestedAt: FieldValue.serverTimestamp(),
      authorizedBy: 'cron-authenticated-operator', requestId: input.requestId,
      resumeWritingRunId: input.resumeWritingRunId || null });
    if (input.plan) tx.set(planRef, { dayKey: input.dayKey, topicHint: input.plan.topicHint.trim() || null,
      directiveHint: input.plan.directiveHint.trim() || null, expandedDirective: null, articleFormat: 'article',
      mustUseTrending: false, status: 'pending', failedReason: null, usedAt: null,
      updatedAt: FieldValue.serverTimestamp(), createdAt: previousPlan?.createdAt ?? FieldValue.serverTimestamp(),
      createdBy: 'liv-api-operator' });
    tx.set(ref, { retryAuthorization: audit.id, updatedAt: FieldValue.serverTimestamp(),
      ...(input.resumeWritingRunId ? { resumeWritingRunId: input.resumeWritingRunId } : {}) }, { merge: true });
    return { status: 'retry_authorized' as const };
  });
}
