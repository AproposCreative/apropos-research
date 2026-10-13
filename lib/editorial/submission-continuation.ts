import { readSubmission } from './submissions';
import { runSubmissionStep } from './submission-worker';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { submissionStore } from './submissions';
import { approveSubmissionPublication, publishSubmission } from './submission-publication';
import { assertPublicationConsent, type PublicationConsent } from './submission-consent';
import { hasCurrentPublicationConsent } from './submission-consent-state';

/** Drain only new zero-AI work. Each step retains its existing lease, receipt and checks.
 * A timeout never buys/replays a stage: the next cron reads the same durable state. */
export async function continueSubmissionPreparation(uid: string, id: string) {
  const row = await readSubmission(uid, id);
  if (row.executionPolicy !== 'chatgpt-first-v1') return runSubmissionStep(uid, id);
  return withoutPaidAi(async () => {
    const deadline = Date.now() + 60_000;
    let result: Awaited<ReturnType<typeof runSubmissionStep>> = { status: row.status };
    for (let steps = 0; steps < 8 && Date.now() < deadline; steps++) {
      result = await runSubmissionStep(uid, id);
      if (result.status !== 'processing') break;
    }
    return result;
  });
}

/** Continues one durable personal consent, never synthesizes a second approval.
 * Called by after() and the existing cron, independently of a chat response. */
export async function continueSubmissionWorkflow(uid: string, id: string) {
  return withoutPaidAi(async () => {
    let row = await readSubmission(uid, id) as Awaited<ReturnType<typeof readSubmission>> & {
      publicationConsent?: PublicationConsent; preparedHash?: string };
    if (row.status === 'processing') {
      await continueSubmissionPreparation(uid, id);
      row = await readSubmission(uid, id) as typeof row;
    }
    if (row.status === 'prepared' && hasCurrentPublicationConsent(row) && row.publicationConsent?.status === 'pending') {
      try {
        const consent = assertPublicationConsent(row, row.publicationConsent.id);
        await approveSubmissionPublication(uid, id, row.preparedHash!, 'now', consent.id);
      } catch (error) {
        // A concurrent continuation may already have advanced the same receipt.
        const latest = await readSubmission(uid, id);
        if (['scheduled', 'published'].includes(latest.status)) return { status: latest.status };
        const blocker = error instanceof Error && /^mcp_submission_[a-z_]+$/.test(error.message) ? error.message : 'mcp_submission_publication_unconfirmed';
        const { db, collection } = submissionStore();
        await db.runTransaction(async tx => {
          const ref = collection.doc(id), current = (await tx.get(ref)).data();
          if (current?.status === 'prepared' && current.publicationConsent?.id === row.publicationConsent?.id) {
            tx.update(ref, { status: 'blocked', blocker, blockedStep: 'publication-consent', publicationConsentPending: false });
          }
        });
        return { status: 'blocked', blocker };
      }
      row = await readSubmission(uid, id) as typeof row;
    }
    if (row.status === 'scheduled') return publishSubmission(uid, id);
    return { status: row.status };
  });
}
