import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { submissionStore } from '@/lib/editorial/submissions';
import { continueSubmissionPreparation, continueSubmissionWorkflow } from '@/lib/editorial/submission-continuation';
import { publishSubmission } from '@/lib/editorial/submission-publication';
import { hasCurrentPublicationConsent } from '@/lib/editorial/submission-consent-state';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const denied = requireCronBearer(req); if (denied) return denied;
  const { collection } = submissionStore();
  // No speculative production: only personally approved saved jobs are eligible.
  const due = await collection.where('status', '==', 'scheduled').limit(30).get();
  const ready = due.docs.find(doc => Date.parse(doc.data().publication?.publishAt || '') <= Date.now() &&
    (doc.data().publishLeaseUntil || 0) <= Date.now() && (doc.data().reconcileAfter || 0) <= Date.now());
  if (ready) return NextResponse.json(await publishSubmission(ready.data().uid, ready.id));
  const consentJobs = await collection.where('publicationConsentPending', '==', true).limit(30).get();
  const consentReady = consentJobs.docs.find(doc => {
    const row = doc.data();
    return hasCurrentPublicationConsent({ uid: row.uid, revision: row.revision, contentHash: row.contentHash, publicationConsent: row.publicationConsent }) &&
      ['prepared', 'processing'].includes(row.status) && (row.workerUntil || 0) <= Date.now();
  });
  if (consentReady) return NextResponse.json(await continueSubmissionWorkflow(consentReady.data().uid, consentReady.id));
  const jobs = await collection.where('status', '==', 'processing').limit(30).get();
  const next = jobs.docs.find(doc => (doc.data().workerUntil || 0) <= Date.now());
  return NextResponse.json(next ? await continueSubmissionPreparation(next.data().uid, next.id) : { status: 'idle', paidAiCalls: 0 });
}
