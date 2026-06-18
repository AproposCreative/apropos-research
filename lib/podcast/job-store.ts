import { getAdminDb } from '@/lib/firebase-admin';
import type { PodcastJobDoc, PodcastJobStep } from '@/lib/podcast/types';

const COLLECTION = 'podcastJobs';

function nowIso(): string {
  return new Date().toISOString();
}

export async function createPodcastJob(input: {
  jobId: string;
  slug: string;
  articleUrl: string;
  title?: string;
}): Promise<PodcastJobDoc> {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke konfigureret');

  const ts = nowIso();
  const doc: PodcastJobDoc = {
    jobId: input.jobId,
    slug: input.slug,
    articleUrl: input.articleUrl,
    title: input.title,
    status: 'queued',
    step: 'queued',
    createdAt: ts,
    updatedAt: ts,
  };

  await db.collection(COLLECTION).doc(input.jobId).set(doc);
  return doc;
}

export async function updatePodcastJob(
  jobId: string,
  patch: Partial<Pick<PodcastJobDoc, 'status' | 'step' | 'error' | 'failedStep' | 'title'>>
): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke konfigureret');
  await db
    .collection(COLLECTION)
    .doc(jobId)
    .set({ ...patch, updatedAt: nowIso() }, { merge: true });
}

export async function setJobProcessing(jobId: string, step: PodcastJobStep): Promise<void> {
  await updatePodcastJob(jobId, { status: 'processing', step });
}

export async function setJobDone(jobId: string): Promise<void> {
  await updatePodcastJob(jobId, { status: 'done', step: 'done' });
}

export async function setJobError(
  jobId: string,
  failedStep: PodcastJobStep,
  error: string
): Promise<void> {
  await updatePodcastJob(jobId, {
    status: 'error',
    step: failedStep,
    failedStep,
    error,
  });
}

export async function getPodcastJob(jobId: string): Promise<PodcastJobDoc | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection(COLLECTION).doc(jobId).get();
  if (!snap.exists) return null;
  return snap.data() as PodcastJobDoc;
}
