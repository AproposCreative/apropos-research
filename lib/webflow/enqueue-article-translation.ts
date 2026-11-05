import { createHash, randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';
import { runArticleTranslation } from '@/lib/webflow/article-translation';

const MAX_ATTEMPTS = 4;
const LEASE_MS = 6 * 60_000; // Longer than either worker's function timeout.
const RETRY_DELAYS_MS = [2 * 60_000, 15 * 60_000, 60 * 60_000];
const WEBHOOK_SOURCE = 'webhook:collection_item_published';

function queue() {
  const db = getAdminDb();
  if (!db) throw new Error('Joblageret for oversættelse er utilgængeligt.');
  return db.collection('articleTranslationQueue');
}

/** Persist before acknowledging Webflow. Duplicate deliveries can share a job. */
export async function enqueueArticleTranslation(itemId: string, deliveryKey: string | null) {
  if (!/^[a-f0-9]{24}$/.test(itemId)) throw new Error('Ugyldigt artikel-id.');
  const event = deliveryKey ? createHash('sha256').update(deliveryKey).digest('hex') : randomUUID();
  const ref = queue().doc(`${itemId}-${event}`);
  try {
    await ref.create({ itemId, attempts: 0, status: 'queued', dueAt: Date.now() });
  } catch (error) {
    if ((error as { code?: number }).code !== 6) throw error; // Firestore ALREADY_EXISTS.
  }
  after(() => processArticleTranslationJob(ref));
}

async function processArticleTranslationJob(ref: DocumentReference): Promise<void> {
  const job = await ref.firestore.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    const now = Date.now();
    if (!row || typeof row.dueAt !== 'number' || row.dueAt > now) return null;
    if (row.attempts >= MAX_ATTEMPTS) {
      tx.update(ref, { status: 'failed', result: 'worker_interrupted', dueAt: FieldValue.delete() });
      return null;
    }
    const attempts = row.attempts + 1;
    tx.update(ref, { attempts, status: 'running', dueAt: now + LEASE_MS });
    return { itemId: String(row.itemId), attempts };
  });
  if (!job) return;

  let outcome: 'ok' | 'skipped' | 'retry';
  let reason: string | null;
  try {
    const result = await runArticleTranslation(job.itemId, { source: WEBHOOK_SOURCE });
    outcome = result.retryable ? 'retry' : result.skipped ? 'skipped' : 'ok';
    reason = result.reason ?? null;
  } catch {
    // The worker keeps the detailed receipt. The queue only needs the outcome.
    outcome = 'retry';
    reason = 'translation_failed';
  }
  await ref.firestore.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current?.status !== 'running' || current.attempts !== job.attempts) return;
    const retry = outcome === 'retry' && job.attempts < MAX_ATTEMPTS;
    tx.update(ref, {
      status: retry ? 'queued' : outcome === 'retry' ? 'failed' : outcome,
      result: reason,
      dueAt: retry ? Date.now() + RETRY_DELAYS_MS[job.attempts - 1] : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function recoverDueArticleTranslations(): Promise<number> {
  const due = await queue().where('dueAt', '<=', Date.now()).orderBy('dueAt').limit(4).get();
  const outcomes = await Promise.allSettled(due.docs.map(row => processArticleTranslationJob(row.ref)));
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'rejected') {
      logger.warn('[article-translation] queue recovery failed', { jobId: due.docs[index].id });
    }
  });
  return due.size;
}
