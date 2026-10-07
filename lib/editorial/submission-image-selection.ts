import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import { articleImages } from '@/lib/mcp/markup';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore } from './submissions';
import type { SubmissionRecord } from './submission-contract';
import type { GenerationEvidence } from './image-generation-evidence';

export function projectImageSelection(row: SubmissionRecord, assets: DocumentData[]) {
  const urls = new Set([row.article.featuredImage, ...articleImages(row.article.content).map(image => image.url)]);
  // Include uploaded assets already referenced by the article: attachment
  // acknowledgement may lag the committed article update after a timeout.
  const items = assets.filter(a => a.uid === row.uid && ['uploaded', 'attached'].includes(a.status) && urls.has(a.url) && a.generationEvidence)
    .map(a => ({ assetId: a.assetId as string, url: a.url as string, role: a.role as string, sectionId: a.sectionId ?? null,
      hash: a.originalHash as string, evidence: a.generationEvidence as GenerationEvidence })).sort((a, b) => a.assetId.localeCompare(b.assetId));
  const uncertain = items.filter(a => a.evidence.requiresPersonalSelection);
  const selectionHash = cmsFieldHash({ revision: row.revision, contentHash: row.contentHash, items });
  const accepted = row.mediaSelection?.uid === row.uid && row.mediaSelection.revision === row.revision &&
    row.mediaSelection.contentHash === row.contentHash && row.mediaSelection.selectionHash === selectionHash;
  return { items, selectionHash, required: uncertain.length > 0 && !accepted, accepted,
    warnings: uncertain.map(a => ({ assetId: a.assetId, role: a.role,
      message: a.evidence.status === 'not_supplied' ? 'Billedet er gemt, men den præcise prompt-/referenceoverlevering er ikke indberettet. Se billedet og vælg det personligt.' :
        'Billedet er gemt, men prompt eller reference matcher ikke fuldt ud briefet. Se billedet og vælg det personligt.', reasons: a.evidence.reasons })),
    exactPromptExecutionVerified: false as const, publicationApproval: false as const };
}

export async function readImageSelection(row: SubmissionRecord, tx?: Transaction) {
  const query = submissionStore().collection.doc(row.id).collection('chatAssets').limit(101);
  const assets = await (tx ? tx.get(query) : query.get());
  if (assets.size > 100) throw Error('mcp_submission_media_window_exceeded');
  return projectImageSelection(row, assets.docs.map(doc => doc.data()));
}
export async function assertImageSelection(row: SubmissionRecord, tx?: Transaction) {
  if ((await readImageSelection(row, tx)).required) throw Error('mcp_submission_image_selection_required');
}

/** Called only by an authenticated personal UI click, not a model-facing tool.
 * The selection does not change the article, attest generator input or publish. */
export async function acceptImageSelection(uid: string, id: string, revision: number, selectionHash: string) {
  await readSubmission(uid, id);
  const { db, collection } = submissionStore(), ref = collection.doc(id);
  return db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data() as SubmissionRecord;
    if (!row || row.uid !== uid || row.revision !== revision) throw Error('mcp_submission_preview_changed');
    const selection = await readImageSelection(row, tx);
    if (selection.selectionHash !== selectionHash) throw Error('mcp_submission_preview_changed');
    if (selection.accepted) return { mediaSelected: true, replay: true, publicationApproval: false };
    if (!selection.required || !['draft', 'prepared', 'blocked'].includes(row.status)) throw Error('mcp_submission_operation_pending');
    const receipt = { uid, revision, contentHash: row.contentHash, selectionHash, acceptedAt: new Date().toISOString() };
    tx.create(ref.collection('mediaSelections').doc(selectionHash), { ...receipt, items: selection.items, exactPromptExecutionVerified: false });
    tx.update(ref, { mediaSelection: receipt });
    return { mediaSelected: true, replay: false, publicationApproval: false };
  });
}
