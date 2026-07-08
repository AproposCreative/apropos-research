import { getDb } from './firebase.js';

const COLLECTION = 'podcastJobs';

function nowIso() {
  return new Date().toISOString();
}

export async function setJobProcessing(jobId, step) {
  await getDb().collection(COLLECTION).doc(jobId).set(
    { status: 'processing', step, updatedAt: nowIso() },
    { merge: true }
  );
}

export async function setJobDone(jobId) {
  await getDb().collection(COLLECTION).doc(jobId).set(
    { status: 'done', step: 'done', updatedAt: nowIso(), error: null, failedStep: null },
    { merge: true }
  );
}

export async function setJobError(jobId, failedStep, error) {
  await getDb().collection(COLLECTION).doc(jobId).set(
    { status: 'error', step: failedStep, failedStep, error, updatedAt: nowIso() },
    { merge: true }
  );
}
