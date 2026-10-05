import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { stagedSaveCandidates } from '@/lib/articles/find-staged-save';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
import { inspectLivCmsDraft } from '@/lib/liv/cms-readback';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore, getSubmissionStatus } from './submissions';

/** Reconcile saved CMS intent only. No new CMS create, no AI, no publication. */
export async function reconcileSubmission(uid: string, id: string) {
  return withoutPaidAi(async () => {
    const row = await readSubmission(uid, id), { db, collection } = submissionStore(), ref = collection.doc(id);
    if (row.status !== 'blocked') return getSubmissionStatus(uid, id);
    const stages = ref.collection('stages');
    const [cms, visual, checks, ...assets] = await Promise.all(['cms', 'visual', 'checks', 'cover', 'body-1', 'body-2']
      .map(name => stages.doc(`${row.contentHash}-${name}`).get().then(s => s.data())));
    if (cms?.status !== 'attempted' || !cms.inputPayload || visual?.status !== 'done' || checks?.status !== 'done' ||
        assets.some(a => a?.status !== 'done')) throw Error('mcp_submission_reconciliation_evidence_missing');
    const saveRef = db.collection('writerWorkspaces').doc(uid).collection('cmsSaves').doc(`submission-${id}`);
    const old = (await saveRef.get()).data();
    if (!old || !['attempted', 'saved'].includes(old.phase) || !old.expected || old.leaseUntil > Date.now()) throw Error('mcp_submission_reconciliation_evidence_missing');
    const normalized = normalizeArticlePayload({ ...cms.inputPayload, status: 'draft', workflowState: 'webflow_draft' });
    const { publishDate: _date, webflowId: _webflowId, id: _localId, ...stable } = normalized;
    if (old.hash !== cmsFieldHash(stable)) throw Error('mcp_submission_revision_conflict');
    // Reads only: never invoke the save helper's create/update branches.
    const expected = old.expected;
    let itemId = old.articleId as string | undefined;
    if (!itemId) {
      const candidates = (await stagedSaveCandidates(expected)).filter(candidate => !old.beforeIds?.includes(candidate));
      if (candidates.length !== 1) throw Error('mcp_submission_reconciliation_evidence_missing');
      itemId = candidates[0];
    }
    const proof = await inspectLivCmsDraft({ itemId, expected });
    if (!proof.draftConfirmed || !proof.publicationReady || !proof.checks.length || proof.checks.some(c => !c.ok)) throw Error('mcp_submission_cms_checks_failed');
    const prepared = { itemId, expected, proof }, savedAssets = assets.map(a => a!.result);
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      const currentSave = (await tx.get(saveRef)).data();
      if (!current || current.uid !== uid || current.status !== 'blocked' || current.contentHash !== row.contentHash || current.revision !== row.revision) throw Error('mcp_submission_revision_conflict');
      if (currentSave?.hash !== old.hash || currentSave.token !== old.token) throw Error('mcp_submission_revision_conflict');
      tx.update(saveRef, { phase: 'saved', articleId: itemId, leaseUntil: 0 });
      tx.update(stages.doc(`${row.contentHash}-cms`), { status: 'done', result: prepared, completedAt: new Date().toISOString(), reconciled: true });
      tx.update(ref, { status: 'prepared', prepared, assets: savedAssets, preparedHash: cmsFieldHash({ expected, assets: savedAssets }), updatedAt: new Date().toISOString() });
    });
    return getSubmissionStatus(uid, id);
  });
}
