import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';
import { COL } from '@/lib/seo-engine/store';

export type SeoEngineJobStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'skipped'
  | 'failed'
  | 'stale';

export type SeoEngineJob = {
  jobId: string;
  itemId: string;
  cmsLastUpdated: string;
  inputVersionHash?: string;
  status: SeoEngineJobStatus;
  attempt: number;
  maxAttempts: number;
  processingStartedAt?: unknown;
  lastError?: string;
  source: 'webhook' | 'publish_app' | 'manual' | 'recovery';
  createdAt?: unknown;
  updatedAt?: unknown;
  seoVersionId?: string;
  skipReason?: string;
};

const STALE_PROCESSING_MS = 25 * 60 * 1000;

function requireDb() {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke tilgængelig');
  return db;
}

export function buildProvisionalJobId(itemId: string, cmsLastUpdated: string): string {
  const safe = String(cmsLastUpdated || 'unknown')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  return `${itemId}_${safe}`;
}

/** Durable enqueue — must be awaited by webhook before 200. */
export async function writeQueuedSeoEngineJob(args: {
  itemId: string;
  cmsLastUpdated: string;
  source: SeoEngineJob['source'];
}): Promise<{ jobId: string; created: boolean }> {
  const db = requireDb();
  const jobId = buildProvisionalJobId(args.itemId, args.cmsLastUpdated);
  const ref = db.collection(COL.jobs).doc(jobId);
  const existing = await ref.get();
  if (existing.exists) {
    const data = existing.data() as SeoEngineJob;
    if (data.status === 'succeeded' || data.status === 'processing' || data.status === 'queued') {
      return { jobId, created: false };
    }
  }
  const doc: SeoEngineJob = {
    jobId,
    itemId: args.itemId,
    cmsLastUpdated: args.cmsLastUpdated,
    status: 'queued',
    attempt: 0,
    maxAttempts: 3,
    source: args.source,
  };
  await ref.set(
    {
      ...doc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { jobId, created: true };
}

export async function claimSeoEngineJob(jobId: string): Promise<SeoEngineJob | null> {
  const db = requireDb();
  const ref = db.collection(COL.jobs).doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as SeoEngineJob;
    if (data.status === 'succeeded' || data.status === 'skipped' || data.status === 'stale') {
      return null;
    }
    if (data.status === 'failed' && data.attempt >= data.maxAttempts) return null;
    if (data.status === 'processing' && data.processingStartedAt) {
      const started =
        typeof (data.processingStartedAt as { toMillis?: () => number }).toMillis === 'function'
          ? (data.processingStartedAt as { toMillis: () => number }).toMillis()
          : 0;
      if (started && Date.now() - started < STALE_PROCESSING_MS) return null;
    }
    const nextAttempt = (data.attempt || 0) + 1;
    if (nextAttempt > (data.maxAttempts || 3) && data.status !== 'queued') {
      return null;
    }
    const next: SeoEngineJob = {
      ...data,
      status: 'processing',
      attempt: nextAttempt,
    };
    tx.set(
      ref,
      {
        status: 'processing',
        attempt: next.attempt,
        processingStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return next;
  });
}

export async function updateSeoEngineJob(
  jobId: string,
  patch: Partial<SeoEngineJob>
): Promise<void> {
  const db = requireDb();
  await db
    .collection(COL.jobs)
    .doc(jobId)
    .set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/**
 * Re-queue a job after a non-terminal busy/contention without burning an attempt permanently.
 * Decrements attempt so all maxAttempts can still run real work.
 */
export async function requeueSeoEngineJob(
  jobId: string,
  reason: string,
  opts?: { refundAttempt?: boolean }
): Promise<void> {
  const db = requireDb();
  const ref = db.collection(COL.jobs).doc(jobId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as SeoEngineJob;
    const attempt =
      opts?.refundAttempt === false
        ? data.attempt || 0
        : Math.max(0, (data.attempt || 1) - 1);
    tx.set(
      ref,
      {
        status: 'queued',
        attempt,
        lastError: reason.slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/** Content-level dedupe after hash is known. */
export async function tryClaimContentHash(
  itemId: string,
  inputVersionHash: string
): Promise<'claimed' | 'busy' | 'done'> {
  const db = requireDb();
  const id = `${itemId}_${inputVersionHash}`;
  const ref = db.collection(COL.contentClaims).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const st = String(snap.data()?.status || '');
      if (st === 'succeeded') return 'done';
      if (st === 'processing') {
        const started = snap.data()?.processingStartedAt;
        const ms =
          started && typeof started.toMillis === 'function' ? started.toMillis() : 0;
        if (ms && Date.now() - ms < STALE_PROCESSING_MS) return 'busy';
        // Stale processing — reclaim
      }
      if (st === 'failed' || st === 'skipped' || st === 'stale') {
        // allow retry
      }
    }
    tx.set(
      ref,
      {
        itemId,
        inputVersionHash,
        status: 'processing',
        processingStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return 'claimed';
  });
}

export async function completeContentClaim(
  itemId: string,
  inputVersionHash: string,
  status: 'succeeded' | 'failed' | 'skipped' | 'stale'
): Promise<void> {
  const db = requireDb();
  await db
    .collection(COL.contentClaims)
    .doc(`${itemId}_${inputVersionHash}`)
    .set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Release a processing claim so retries can proceed (e.g. transient failure). */
export async function releaseContentClaim(
  itemId: string,
  inputVersionHash: string
): Promise<void> {
  const db = requireDb();
  await db
    .collection(COL.contentClaims)
    .doc(`${itemId}_${inputVersionHash}`)
    .set(
      {
        status: 'failed',
        updatedAt: FieldValue.serverTimestamp(),
        releasedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/**
 * Oldest-updated queued jobs first (fair recovery / anti-starvation).
 * Requires composite index: seoEngineJobs (status ASC, updatedAt ASC) — see firestore.indexes.json.
 * Fallback: unordered status==queued query if the index is missing or legacy docs lack updatedAt.
 */
export async function listQueuedSeoEngineJobs(limit = 20): Promise<SeoEngineJob[]> {
  const db = requireDb();
  const col = db.collection(COL.jobs);
  try {
    const snap = await col
      .where('status', '==', 'queued')
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data() as SeoEngineJob);
  } catch (err) {
    // Index not deployed yet, or documents missing updatedAt — degrade gracefully.
    logger.warn(
      '[seo-engine] listQueuedSeoEngineJobs ordered query failed; falling back to unordered limit. Deploy firestore.indexes.json (status+updatedAt).',
      { error: err instanceof Error ? err.message : String(err) }
    );
    const snap = await col.where('status', '==', 'queued').limit(limit).get();
    return snap.docs.map((d) => d.data() as SeoEngineJob);
  }
}
