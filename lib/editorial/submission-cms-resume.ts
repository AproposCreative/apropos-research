import { z } from 'zod';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { articleImages } from '@/lib/mcp/markup';
import { activeMember } from '@/lib/mcp/oauth';
import { readSubmission, submissionStore } from './submissions';
import { approvedSubmissionPolicy } from './submission-policy';
import { assertImageSelection } from './submission-image-selection';
import { inspectPreparedDraftBoundary } from './submission-draft-guard';
import { hasCurrentPublicationConsent } from './submission-consent-state';
import { submissionId } from './submission-contract';

export const resumeCmsInput = z.object({ submissionId, expectedRevision: z.number().int().positive(), expectedCmsHash: submissionId }).strict();

/** Audited recovery of a PRE-WRITE failure, never a lost-write retry.
 * Reuses a bound never-published item and existing preparation approval.
 * Does not invent or upgrade publication consent. No new create or AI. */
export async function resumeSubmissionCms(uid: string, raw: unknown) {
  return withoutPaidAi(async () => {
    const input = resumeCmsInput.parse(raw), row = await readSubmission(uid, input.submissionId);
    const { db, collection } = submissionStore(), ref = collection.doc(row.id);
    const receipt = ref.collection('cmsResumptions').doc(cmsFieldHash(input));
    const replay = (await receipt.get()).data();
    if (replay) return { ...replay.result, replay: true, currentStatus: row.status };
    if (row.revision !== input.expectedRevision || row.status !== 'blocked' || row.executionPolicy !== 'chatgpt-first-v1') throw Error('mcp_submission_revision_conflict');
    const policy = approvedSubmissionPolicy(row);
    if (row.choices.aiFinalChecks !== 'human' || !await activeMember(uid, Date.parse(row.approval?.acceptedAt || ''))) throw Error('mcp_submission_approval_required');
    await assertImageSelection(row);
    const stage = ref.collection('stages').doc(`${row.contentHash}-cms`);
    const save = db.collection('writerWorkspaces').doc(uid).collection('cmsSaves').doc(`submission-${row.id}`);
    const [cms, saved, current] = await Promise.all([stage.get(), save.get(), ref.get()]);
    const intent = cms.data(), attempt = saved.data(), prepared = current.data()?.prepared;
    if (!prepared || row.publishedTarget || intent?.status !== 'attempted' || !intent.inputPayload ||
      attempt?.phase !== 'preparing' || attempt.expected || attempt.leaseUntil > Date.now() ||
      attempt.articleId !== prepared.itemId || current.data()?.blockedStep !== 'cms') throw Error('mcp_submission_cms_resume_not_safe');
    const normalized = normalizeArticlePayload({ ...intent.inputPayload, status: 'draft', workflowState: 'webflow_draft' });
    const { publishDate: _date, webflowId: _webflow, id: _id, ...stable } = normalized;
    if (attempt.hash !== cmsFieldHash(stable)) throw Error('mcp_submission_revision_conflict');
    const boundary = await inspectPreparedDraftBoundary(prepared);
    if (boundary.cmsHash !== input.expectedCmsHash) throw Error('mcp_submission_cms_conflict');
    const names = ['visual', 'checks', 'cover', ...Array.from({ length: Math.max(policy.minimumBodyImages ?? 2, articleImages(row.article.content).length) }, (_, i) => `body-${i + 1}`)];
    const proofs = await Promise.all(names.map(name => ref.collection('stages').doc(`${row.contentHash}-${name}`).get()));
    if (proofs.some(p => p.data()?.status !== 'done')) throw Error('mcp_submission_reconciliation_evidence_missing');
    return db.runTransaction(async tx => {
      const [latest, latestSave, latestStage, existing] = await Promise.all([tx.get(ref), tx.get(save), tx.get(stage), tx.get(receipt)]);
      if (existing.exists) return { ...existing.data()!.result, replay: true };
      const live = latest.data();
      if (live?.revision !== row.revision || live.contentHash !== row.contentHash || live.status !== 'blocked' || (live.workerUntil || 0) > Date.now() ||
        live.approval?.contentHash !== row.contentHash || latestSave.data()?.token !== attempt.token || latestSave.data()?.phase !== 'preparing' ||
        latestSave.data()?.expected || latestSave.data()?.leaseUntil > Date.now() || latestStage.data()?.status !== 'attempted') throw Error('mcp_submission_revision_conflict');
      const result = { submissionId: row.id, revision: row.revision, status: 'processing', queuedOnServer: true, itemId: prepared.itemId, paidAiCalls: 0, publicationApproval: false };
      const at = new Date().toISOString();
      tx.create(receipt, { input, result, beforeWrite: boundary, priorStage: intent, priorSave: attempt, priorBlocker: live.blocker, createdAt: at });
      tx.update(stage, { status: 'retryable_before_write', recoveryReceiptId: receipt.id });
      tx.update(ref, { status: 'processing', blocker: null, blockedStep: null,
        publicationConsentPending: hasCurrentPublicationConsent(row), updatedAt: at });
      return { ...result, replay: false };
    });
  });
}
