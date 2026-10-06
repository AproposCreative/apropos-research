import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { copenhagenClock } from '@/lib/liv/delivery-policy';
import type { QualityJob } from './jobs';
import { hasFreshPerformanceEvidence } from './policy';
import { recentPublication } from './archive-policy';

/** Archive recovery retains its daily limit; Google jobs require atomic queue admission.
 * Paid/uncertain stages and pending CMS writes always retain reconciliation. */
export async function admitArchiveReview(job: QualityJob, now = new Date()): Promise<boolean> {
  if (!['recovery', 'performance'].includes(job.source) || job.writeStartedAt || job.manualRequested) return true;
  if (!/^[a-f0-9]{64}$/.test(job.id)) throw new Error('seo_invalid_job_id');
  const db = getAdminDb(); if (!db) throw new Error('seo_firestore_unavailable');
  const day = copenhagenClock(now).day;
  const admissions = db.collection('seoArchiveAdmissions');
  const jobRef = admissions.doc(`job-${job.id}`), dayRef = admissions.doc(`day-${day}`);
  const stages = ['review', 'verify'].map(stage => db.collection('seoPostPublishModelStages')
    .doc(createHash('sha256').update(`${job.id}:${stage}`).digest('hex')));
  return db.runTransaction(async tx => {
    const [prior, daily, review, verify, performance] = await tx.getAll(jobRef, dayRef, ...stages, db.collection('seoPerformanceAdmissions').doc(`job-${job.id}`));
    if ([review, verify].some(row => ['started', 'responded', 'uncertain'].includes(row.data()?.status))) return true;
    if (job.source === 'performance') return job.mode === 'performance' &&
      performance.data()?.policy === 'google-auto-v1' && performance.data()?.jobId === job.id &&
      hasFreshPerformanceEvidence(job.evidence, now.getTime());
    if (!recentPublication(job.discoveredPublishedAt, now)) return false;
    if (prior.exists) return true;
    if (daily.exists) return daily.data()?.jobId === job.id;
    const receipt = { jobId: job.id, day, admittedAt: now.toISOString(), policy: 'recent-recovery-manual-archive-v2' };
    tx.create(dayRef, receipt); tx.create(jobRef, receipt);
    return true;
  });
}
