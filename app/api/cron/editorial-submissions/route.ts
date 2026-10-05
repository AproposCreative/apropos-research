import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { submissionStore } from '@/lib/editorial/submissions';
import { runSubmissionStep } from '@/lib/editorial/submission-worker';
import { publishSubmission } from '@/lib/editorial/submission-publication';
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
  const jobs = await collection.where('status', '==', 'processing').limit(30).get();
  const next = jobs.docs.find(doc => (doc.data().workerUntil || 0) <= Date.now());
  return NextResponse.json(next ? await runSubmissionStep(next.data().uid, next.id) : { status: 'idle', paidAiCalls: 0 });
}
