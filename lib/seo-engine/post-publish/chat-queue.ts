import type { Transaction } from 'firebase-admin/firestore';
import { seoDb, seoStateId } from './processor';
import type { QualityJob } from './jobs';
import { hasFreshPerformanceEvidence } from './policy';
import { isDeterministicSeoPrewriteError } from './prewrite-validation';

export const ACTIVE_SEO_STATUSES = ['queued', 'waiting_budget', 'running', 'verify_pending'];
export const SEO_QUEUE_WINDOW = 200;

/** Retain rejected proposals and their reservations for explicit revision.
 * An uncertain write ALWAYS stays eligible for reconciliation, regardless of
 * the latest error. This also handles old queued proposals before migration. */
export function requiresSeoProposalRevision(job: QualityJob) {
  return !job.writeStartedAt && Boolean(job.chatReview?.proposal) && isDeterministicSeoPrewriteError(job.reason);
}

export function isPublicationEventJob(job: QualityJob) {
  return job.mode === 'publication_quality' && ['publish_app', 'webhook'].includes(job.source);
}

/** Priority is a selection hint, never editorial evidence or permission to write. */
export function chatQueuePriority(job: QualityJob, uid: string, now: number) {
  if (job.chatReview?.uid === uid && job.writeStartedAt) return 0;
  if (job.chatReview?.uid === uid && now - Date.parse(job.updatedAt) < 2 * 3600_000) return 1;
  // New publication checks must not wait behind archive improvements or an
  // abandoned review. Live active reviews and uncertain writes still resume.
  if (isPublicationEventJob(job)) return 2;
  const metadata = job.snapshot.metadata;
  if (!metadata.seoTitle.trim() || !metadata.metaDescription.trim()) return 3;
  if (job.chatReview?.uid === uid) return 4;
  if (job.mode === 'performance' && hasFreshPerformanceEvidence(job.evidence, now)) return 5;
  return 6;
}

/** Single-field active-status index; terminal history cannot crowd out work.
 * Rotate a bounded window across batches. Persist cursor WITH batch creation,
 * so concurrent/lost requests cannot advance it twice. No new queue or reset. */
export async function selectChatCandidates(tx: Transaction, uid: string, now = Date.now(), previouslyChecked: ReadonlySet<string> = new Set()) {
  const jobs = seoDb().collection('seoPostPublishJobs');
  const cursorRef = seoDb().collection('seoPostPublishControl').doc(`chat-queue-${seoStateId(uid, 'cursor')}`);
  const cursor = (await tx.get(cursorRef)).data()?.after;
  let query = jobs.where('status', 'in', ACTIVE_SEO_STATUSES).limit(SEO_QUEUE_WINDOW + 1);
  if (typeof cursor === 'string') {
    const previous = await tx.get(jobs.doc(cursor));
    if (previous.exists) query = query.startAfter(previous);
  }
  const result = await tx.get(query);
  const window = result.docs.slice(0, SEO_QUEUE_WINDOW);
  const hasMore = result.docs.length > SEO_QUEUE_WINDOW;
  const candidates = window.map(doc => ({ ...doc.data(), id: doc.id } as QualityJob))
    .filter(job => ((!job.processor && !job.writeStartedAt) || job.chatReview?.uid === uid) && !requiresSeoProposalRevision(job))
    // Bounded continuation advances past earlier skipped candidates in this
    // run. Never skip a reserved review or uncertain write that must resume.
    .filter(job => !previouslyChecked.has(job.id) || job.chatReview?.uid === uid)
    .sort((a, b) => chatQueuePriority(a, uid, now) - chatQueuePriority(b, uid, now) ||
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { candidateIds: candidates.map(job => job.id), cursorRef,
    cursorState: { after: hasMore ? window.at(-1)!.id : null, updatedAt: new Date(now).toISOString() },
    selection: { version: 'active-priority-v1', scanned: window.length, partial: hasMore || Boolean(cursor) } };
}
