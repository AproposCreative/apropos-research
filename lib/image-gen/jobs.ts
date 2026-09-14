import { getAdminDb } from '@/lib/firebase-admin';
import { imageGenHash } from './article';

export type ImageGenOperation = 'ideas' | 'generate' | 'edit' | 'press-import' | 'save-draft' | 'recover';
export type ImageGenJob = {
  id: string; uid: string; articleId: string; articleVersion: string; operation: ImageGenOperation;
  requestHash: string; status: 'running' | 'succeeded' | 'uncertain' | 'failed-before-provider';
  parameters: unknown;
  createdAt: string; updatedAt: string; deadline: number; result?: unknown; errorCode?: string;
};
const operations: ImageGenOperation[] = ['ideas', 'generate', 'edit', 'press-import', 'save-draft', 'recover'];
function workspace(uid: string) {
  if (!uid || uid.length > 128 || uid.includes('/')) throw new Error('image_gen_identity_invalid');
  const db = getAdminDb(); if (!db) throw new Error('image_gen_store_unavailable');
  return { db, ref: db.collection('imageGenWorkspaces').doc(uid) };
}
function jobId(id: string) { if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('image_gen_job_invalid'); return id; }

/** Idempotency is scoped by verified UID. Never reset a started job after a timeout. */
export async function claimImageGenJob(uid: string, input: {
  requestId: string; articleId: string; articleVersion: string; operation: ImageGenOperation; parameters: unknown;
}, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0 || !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId) || !/^[a-f0-9]{24}$/.test(input.articleId) ||
      !/^[a-f0-9]{64}$/.test(input.articleVersion) || !operations.includes(input.operation)) throw new Error('image_gen_job_invalid');
  const serialized = JSON.stringify([input.articleId, input.articleVersion, input.operation, input.parameters]);
  if (Buffer.byteLength(serialized) > 100_000) throw new Error('image_gen_job_invalid');
  const requestHash = imageGenHash(serialized), id = imageGenHash(`${uid}\n${input.requestId}`);
  const { db, ref } = workspace(uid), target = ref.collection('jobs').doc(id);
  return db.runTransaction(async tx => {
    const existing = (await tx.get(target)).data() as ImageGenJob | undefined;
    if (existing) {
      if (existing.uid !== uid || existing.requestHash !== requestHash) throw new Error('image_gen_idempotency_conflict');
      return { created: false, job: existing };
    }
    const state = (await tx.get(ref)).data();
    if (state?.activeJob) {
      const active = (await tx.get(ref.collection('jobs').doc(jobId(state.activeJob)))).data() as ImageGenJob | undefined;
      if (!active || active.status === 'running') throw new Error('image_gen_job_in_progress');
    }
    const timestamp = new Date(now).toISOString();
    const job: ImageGenJob = { id, uid, articleId: input.articleId, articleVersion: input.articleVersion,
      operation: input.operation, requestHash, parameters: JSON.parse(JSON.stringify(input.parameters ?? null)),
      status: 'running', createdAt: timestamp, updatedAt: timestamp, deadline: now + 300_000 };
    tx.create(target, job);
    tx.set(ref, { activeJob: id, updatedAt: timestamp }, { merge: true });
    return { created: true, job };
  });
}

export async function readImageGenJob(uid: string, id: string): Promise<ImageGenJob | null> {
  const row = (await workspace(uid).ref.collection('jobs').doc(jobId(id)).get()).data() as ImageGenJob | undefined;
  if (row && row.uid !== uid) throw new Error('image_gen_identity_invalid');
  return row ?? null;
}

export async function listImageGenJobs(uid: string, cursor?: string) {
  const collection = workspace(uid).ref.collection('jobs');
  let query = collection.orderBy('createdAt', 'desc').limit(30);
  if (cursor) {
    const anchor = await collection.doc(jobId(cursor)).get();
    if (!anchor.exists || anchor.data()?.uid !== uid) throw new Error('image_gen_cursor_invalid');
    query = query.startAfter(anchor);
  }
  const rows = await query.get();
  return rows.docs.map(doc => {
    const row = doc.data() as ImageGenJob;
    if (row.uid !== uid || row.id !== doc.id) throw new Error('image_gen_identity_invalid');
    return row;
  });
}

export async function finishImageGenJob(uid: string, id: string, outcome:
  { status: 'succeeded'; result: unknown } | { status: 'uncertain' | 'failed-before-provider'; errorCode: string }) {
  const { db, ref } = workspace(uid), target = ref.collection('jobs').doc(jobId(id));
  const safe = JSON.parse(JSON.stringify(outcome));
  if (!['succeeded', 'uncertain', 'failed-before-provider'].includes(safe.status) ||
      (safe.status !== 'succeeded' && !/^[a-z][a-z0-9_]{1,80}$/.test(safe.errorCode ?? ''))) throw new Error('image_gen_result_invalid');
  if (Buffer.byteLength(JSON.stringify(safe)) > 700_000) throw new Error('image_gen_result_too_large');
  await db.runTransaction(async tx => {
    const job = (await tx.get(target)).data() as ImageGenJob | undefined;
    const state = (await tx.get(ref)).data();
    if (!job || job.uid !== uid) throw new Error('image_gen_job_missing');
    if (job.status !== 'running') {
      if (job.status !== safe.status || JSON.stringify(job.result ?? null) !== JSON.stringify(safe.result ?? null) ||
          (job.errorCode ?? null) !== (safe.errorCode ?? null)) throw new Error('image_gen_result_conflict');
      return;
    }
    tx.update(target, { ...safe, updatedAt: new Date().toISOString() });
    if (state?.activeJob === id) tx.set(ref, { activeJob: null }, { merge: true });
  });
}

/** Recorded terminal transition, not a reset or new provider authorization. */
export async function markImageGenJobExpired(uid: string, id: string, now = Date.now()) {
  const job = await readImageGenJob(uid, id);
  if (!job || job.status !== 'running') return job;
  if (now < job.deadline + 120_000) throw new Error('image_gen_job_still_running');
  await finishImageGenJob(uid, id, { status: 'uncertain', errorCode: 'execution_deadline_passed' });
  return readImageGenJob(uid, id);
}
