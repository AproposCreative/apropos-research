import type { SubmissionRecord } from './submission-contract';
import type { LivCmsInspectionPolicy } from '@/lib/liv/cms-readback';

export function isChatSubmission(row: Pick<SubmissionRecord, 'executionPolicy'>) {
  return row.executionPolicy === 'chat-final-checks-v1' || row.executionPolicy === 'chatgpt-first-v1';
}
export function assertChatGptFirstPolicy(row: Pick<SubmissionRecord, 'executionPolicy' | 'choices'>) {
  if (row.executionPolicy === 'chatgpt-first-v1' && row.choices.aiFinalChecks !== 'human') {
    throw Error('mcp_submission_paid_ai_disabled');
  }
}

export function requestedEditorialDecision(row: Pick<SubmissionRecord, 'choices'>) {
  return { bodyImages: row.choices.bodyImages || 'required', aiFinalChecks: row.choices.aiFinalChecks || 'required' } as const;
}

/** Choices are proposals until a personal, version-bound UI confirmation.
 * These exceptions never apply to unattended Liv or a model-supplied approval. */
export function approvedSubmissionPolicy(row: SubmissionRecord): LivCmsInspectionPolicy {
  assertChatGptFirstPolicy(row);
  const decision = requestedEditorialDecision(row), approval = row.approval;
  if (decision.bodyImages === 'deferred' || decision.aiFinalChecks === 'human') {
    if (!isChatSubmission(row) || approval?.uid !== row.uid ||
        approval.contentHash !== row.contentHash || !approval.acceptedAt ||
        approval.editorialDecision?.bodyImages !== decision.bodyImages || approval.editorialDecision.aiFinalChecks !== decision.aiFinalChecks) {
      throw Error('mcp_submission_editorial_decision_required');
    }
  }
  return { minimumBodyImages: decision.bodyImages === 'deferred' ? 0 : 2,
    ...(row.publishedTarget ? { allowPublishedUpdate: true } : {}),
    preserveProvidedImages: isChatSubmission(row) };
}
