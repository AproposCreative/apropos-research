/**
 * Firestore persistence for Arkiv impact jobs (`seoEngineArchiveJobs`).
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  ARCHIVE_JOBS_COL,
  deriveJobStatus,
  type ArchiveJob,
  type ArchiveJobTab,
  jobMatchesTab,
} from '@/lib/seo-engine/archive-jobs';

function requireDb() {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke tilgængelig');
  return db;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

export async function upsertArchiveJobs(jobs: ArchiveJob[]): Promise<number> {
  const db = requireDb();
  const batchSize = 400;
  let written = 0;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const chunk = jobs.slice(i, i + batchSize);
    const batch = db.batch();
    for (const job of chunk) {
      const ref = db.collection(ARCHIVE_JOBS_COL).doc(job.jobId);
      const existing = await ref.get();
      if (existing.exists) {
        const prev = existing.data() as ArchiveJob;
        // Preserve verified/applied task progress when re-scanning same kinds
        const prevByKind = new Map(prev.tasks.map((t) => [t.kind, t]));
        const mergedTasks = job.tasks.map((t) => {
          const old = prevByKind.get(t.kind);
          if (!old) return t;
          if (old.status === 'verified' || old.status === 'applied') {
            return { ...t, status: old.status, appliedAt: old.appliedAt, verifiedAt: old.verifiedAt };
          }
          return t;
        });
        // Keep tasks that were verified but no longer in scan (resolved)
        for (const old of prev.tasks) {
          if (
            (old.status === 'verified' || old.status === 'applied') &&
            !mergedTasks.some((t) => t.kind === old.kind)
          ) {
            mergedTasks.push(old);
          }
        }
        const merged: ArchiveJob = {
          ...job,
          createdAt: prev.createdAt || job.createdAt,
          tasks: mergedTasks,
          status: prev.status === 'dismissed' ? 'dismissed' : deriveJobStatus(mergedTasks),
          updatedAt: new Date().toISOString(),
        };
        batch.set(ref, stripUndefined({ ...merged, fsUpdatedAt: FieldValue.serverTimestamp() }), {
          merge: true,
        });
      } else {
        batch.set(ref, stripUndefined({ ...job, fsUpdatedAt: FieldValue.serverTimestamp() }));
      }
      written += 1;
    }
    await batch.commit();
  }
  return written;
}

export async function getArchiveJob(jobId: string): Promise<ArchiveJob | null> {
  const db = requireDb();
  const snap = await db.collection(ARCHIVE_JOBS_COL).doc(jobId).get();
  if (!snap.exists) return null;
  return snap.data() as ArchiveJob;
}

export async function saveArchiveJob(job: ArchiveJob): Promise<void> {
  const db = requireDb();
  const next = { ...job, status: deriveJobStatus(job.tasks), updatedAt: new Date().toISOString() };
  await db
    .collection(ARCHIVE_JOBS_COL)
    .doc(job.jobId)
    .set(stripUndefined({ ...next, fsUpdatedAt: FieldValue.serverTimestamp() }), { merge: true });
}

export async function listArchiveJobs(args?: {
  tab?: ArchiveJobTab;
  limit?: number;
}): Promise<ArchiveJob[]> {
  const db = requireDb();
  const limit = Math.min(300, Math.max(1, args?.limit ?? 120));
  const snap = await db.collection(ARCHIVE_JOBS_COL).limit(500).get();
  let jobs = snap.docs.map((d) => d.data() as ArchiveJob);
  jobs.sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0));
  if (args?.tab) {
    jobs = jobs.filter((j) => jobMatchesTab(j, args.tab!));
  }
  return jobs.slice(0, limit);
}

export async function dismissArchiveJob(jobId: string): Promise<ArchiveJob | null> {
  const job = await getArchiveJob(jobId);
  if (!job) return null;
  const next: ArchiveJob = {
    ...job,
    status: 'dismissed',
    updatedAt: new Date().toISOString(),
  };
  await saveArchiveJob(next);
  return next;
}
