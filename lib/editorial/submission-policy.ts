import type { SubmissionRecord } from './submission-contract';
import type { LivCmsInspectionPolicy } from '@/lib/liv/cms-readback';

export function requestedEditorialDecision(row: Pick<SubmissionRecord, 'choices'>) {
  return { bodyImages: row.choices.bodyImages || 'required', aiFinalChecks: row.choices.aiFinalChecks || 'required' } as const;
}

/** Choices are proposals until a personal, version-bound UI confirmation.
 * These exceptions never apply to unattended Liv or a model-supplied approval. */
export function approvedSubmissionPolicy(row: SubmissionRecord): LivCmsInspectionPolicy {
  const decision = requestedEditorialDecision(row), approval = row.approval;
  if (decision.bodyImages === 'deferred' || decision.aiFinalChecks === 'human') {
    if (row.executionPolicy !== 'chat-final-checks-v1' || approval?.uid !== row.uid ||
        approval.contentHash !== row.contentHash || !approval.acceptedAt ||
        approval.editorialDecision?.bodyImages !== decision.bodyImages || approval.editorialDecision.aiFinalChecks !== decision.aiFinalChecks) {
      throw Error('mcp_submission_editorial_decision_required');
    }
  }
  return { minimumBodyImages: decision.bodyImages === 'deferred' ? 0 : 2,
    ...(row.publishedTarget ? { allowPublishedUpdate: true } : {}),
    preserveProvidedImages: row.executionPolicy === 'chat-final-checks-v1' };
}
