import { createHash, randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { reviewKey, type PublishedArticle, type MetadataField, type PolicyDecision, type PerformanceEvidence, type FieldAssessment } from './policy';
import type { ReviewArticle } from './review';

export type QualityJob = {
  id: string;
  source: 'publish_app' | 'webhook' | 'recovery' | 'performance';
  snapshot: PublishedArticle;
  article: ReviewArticle;
  mode: 'publication_quality' | 'performance';
  evidence?: PerformanceEvidence;
  status: 'queued' | 'running' | 'verify_pending' | 'kept' | 'applied' | 'needs_editor' | 'stale' | 'failed';
  createdAt: string;
  updatedAt: string;
  attempt: number;
  owner?: string;
  leaseUntil?: number;
  readyAt?: number;
  decision?: PolicyDecision;
  assessments?: FieldAssessment[];
  writeStartedAt?: string;
  after?: PublishedArticle;
  publicReceipt?: { url: string; checkedAt: string };
  reason?: string;
};
export type ArticleQualityState = {
  lockedFields: MetadataField[];
  lastAppliedAt?: string;
  lastReviewedKey?: string;
  lastJobId?: string;
  pendingJobId?: string | null;
};
const JOBS = 'seoPostPublishJobs';
const STATES = 'seoPostPublishArticles';
const LEASE_MS = 10 * 60_000;
export const TERMINAL_QUALITY_STATES = ['kept', 'applied', 'needs_editor', 'stale', 'failed'];
const stateId = (itemId: string, locale: string) => createHash('sha256').update(`${itemId}:${locale}`).digest('hex');
function db() {
  const result = getAdminDb();
  if (!result) throw new Error('seo_firestore_unavailable');
  return result;
}

export async function enqueueQualityJob(input: Pick<QualityJob, 'source' | 'snapshot' | 'article' | 'mode' | 'evidence'>) {
  if (!input.snapshot.published || input.snapshot.hasUnpublishedChanges) return { enqueued: false, reason: 'not_cleanly_published' };
  const id = createHash('sha256').update(JSON.stringify([reviewKey(input.snapshot), input.mode,
    input.mode === 'performance' ? input.evidence : null])).digest('hex');
  const ref = db().collection(JOBS).doc(id);
  await db().runTransaction(async tx => {
    if ((await tx.get(ref)).exists) return;
    const now = new Date().toISOString();
    const record: QualityJob = { ...input, id, status: 'queued', createdAt: now, updatedAt: now, attempt: 0, readyAt: Date.now() };
    // Firestore rejects undefined, including optional analytics evidence.
    tx.create(ref, JSON.parse(JSON.stringify(record)));
  });
  return { enqueued: true, jobId: id };
}

export async function claimQualityJob(id: string): Promise<QualityJob | null> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('seo_invalid_job_id');
  const ref = db().collection(JOBS).doc(id);
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const job = snap.data() as QualityJob;
    if (TERMINAL_QUALITY_STATES.includes(job.status) || (job.leaseUntil ?? 0) > Date.now()) return null;
    if (job.attempt >= 5 && !job.writeStartedAt) {
      tx.update(ref, { status: 'failed', reason: 'retry_budget_exhausted', readyAt: FieldValue.delete(), updatedAt: new Date().toISOString() });
      return null;
    }
    const next: QualityJob = { ...job, status: job.writeStartedAt ? 'verify_pending' : 'running',
      owner: randomUUID(), leaseUntil: Date.now() + LEASE_MS, readyAt: Date.now() + LEASE_MS,
      attempt: job.attempt + 1, updatedAt: new Date().toISOString() };
    tx.set(ref, next);
    return next;
  });
}

/** Every checkpoint is fenced by the worker's lease owner. */
export async function checkpointQualityJob(job: QualityJob, patch: Partial<QualityJob>, release = false) {
  const ref = db().collection(JOBS).doc(job.id);
  await db().runTransaction(async tx => {
    const current = (await tx.get(ref)).data() as QualityJob | undefined;
    if (!current || !job.owner || current.owner !== job.owner || (current.leaseUntil ?? 0) <= Date.now()) throw new Error('seo_job_lease_lost');
    tx.update(ref, { ...JSON.parse(JSON.stringify(patch)), updatedAt: new Date().toISOString(),
      readyAt: TERMINAL_QUALITY_STATES.includes(patch.status || current.status) ? FieldValue.delete() : Date.now() + (release ? 60_000 : LEASE_MS),
      leaseUntil: release ? 0 : Date.now() + LEASE_MS });
  });
}

export async function getArticleQualityState(itemId: string, locale: string): Promise<ArticleQualityState> {
  const state = (await db().collection(STATES).doc(stateId(itemId, locale)).get()).data() as ArticleQualityState | undefined;
  return { ...state, lockedFields: state?.lockedFields ?? [] };
}

/** Reserve the article before transport; only readback can release an uncertain write. */
export async function reserveQualityWrite(job: QualityJob, decision: PolicyDecision) {
  const jobRef = db().collection(JOBS).doc(job.id);
  const articleRef = db().collection(STATES).doc(stateId(job.snapshot.itemId, job.snapshot.locale));
  const startedAt = new Date().toISOString();
  await db().runTransaction(async tx => {
    const [jobSnap, articleSnap] = await Promise.all([tx.get(jobRef), tx.get(articleRef)]);
    const current = jobSnap.data() as QualityJob | undefined;
    const state = articleSnap.data() as ArticleQualityState | undefined;
    if (!current || current.owner !== job.owner || (current.leaseUntil ?? 0) <= Date.now()) throw new Error('seo_job_lease_lost');
    if (state?.pendingJobId && state.pendingJobId !== job.id) throw new Error('seo_article_write_pending');
    if ((state?.lockedFields || []).some(field => field in decision.patch)) throw new Error('seo_editorial_lock_changed');
    if (state?.lastAppliedAt && Date.now() - Date.parse(state.lastAppliedAt) < 28 * 86400_000) throw new Error('seo_cooldown_changed');
    tx.update(jobRef, { decision, writeStartedAt: startedAt, status: 'verify_pending', updatedAt: startedAt });
    tx.set(articleRef, { pendingJobId: job.id }, { merge: true });
  });
  job.writeStartedAt = startedAt;
  job.decision = decision;
}

/** Complete job + cooldown in one transaction so a publish webhook cannot race completion. */
export async function finishQualityJob(job: QualityJob, patch: Partial<QualityJob>) {
  const jobRef = db().collection(JOBS).doc(job.id);
  const articleRef = db().collection(STATES).doc(stateId(job.snapshot.itemId, job.snapshot.locale));
  await db().runTransaction(async tx => {
    const current = (await tx.get(jobRef)).data() as QualityJob | undefined;
    const state = (await tx.get(articleRef)).data() as ArticleQualityState | undefined;
    if (!current || !job.owner || current.owner !== job.owner || (current.leaseUntil ?? 0) <= Date.now()) throw new Error('seo_job_lease_lost');
    const now = new Date().toISOString();
    tx.update(jobRef, { ...JSON.parse(JSON.stringify(patch)), updatedAt: now, leaseUntil: 0, readyAt: FieldValue.delete() });
    tx.set(articleRef, { lastJobId: job.id, lastReviewedKey: reviewKey(job.snapshot),
      ...(patch.status === 'applied' && state?.pendingJobId === job.id ? { pendingJobId: null } : {}),
      ...(patch.status === 'applied' ? { lastAppliedAt: job.writeStartedAt || now } : {}) }, { merge: true });
  });
}

export async function listRecoverableQualityJobs(limit = 10): Promise<string[]> {
  // A single indexed scheduling field avoids composite-index deployment and
  // prevents active/terminal jobs at the front of the collection starving others.
  const records = await db().collection(JOBS).where('readyAt', '<=', Date.now()).orderBy('readyAt').limit(Math.max(1, Math.min(50, limit))).get();
  return records.docs.filter(doc => Number(doc.data().leaseUntil || 0) <= Date.now()).map(doc => doc.id);
}
