import { createHash } from 'node:crypto';
import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import type { SubmissionRecord } from './submission-contract';
import { submissionStore } from './submissions';
import { selectedAssetUrls } from './submission-compressed-media';
import { imageProtectedContentHash } from './image-content-invariant';
import { EXISTING_COVER_AUTHORIZATION as permit } from './existing-cover-authorization';

const invalid = () => Error('mcp_submission_existing_cover_not_authorized');
export const existingCoverAssetId = () => cmsFieldHash({ uid: permit.uid, id: permit.submissionId, requestId: permit.requestId });
export function assertExistingCoverBytes(bytes: Buffer) {
  if (bytes.length !== permit.byteCount || createHash('sha256').update(bytes).digest('hex') !== permit.sha256) throw invalid();
}
export function existingCoverDisclosure(asset: DocumentData): string | null {
  return asset.uid === permit.uid && asset.submissionId === permit.submissionId && asset.assetId === existingCoverAssetId() &&
    asset.originalHash === permit.sha256 && cmsFieldHash(asset.existingCoverAuthorization || {}) === cmsFieldHash(permit) ? permit.warning : null;
}

/** Validate on staging AND selection. No public import parameter can enable this.
 * The parent must still be the actual selected cover (including verified WebP).
 * A previously rejected/declined candidate is not silently revived. */
export async function assertExistingCoverIntent(row: SubmissionRecord, input: DocumentData, tx?: Transaction) {
  if (row.uid !== permit.uid || row.id !== permit.submissionId || row.publishedTarget?.itemId !== permit.cmsItemId ||
      input.submissionId !== permit.submissionId || input.requestId !== permit.requestId ||
      input.replaceAssetId !== permit.parentAssetId || input.origin !== 'chatgpt-edited' || input.role !== 'cover' ||
      input.kind !== 'illustration' || input.sectionId !== permit.sectionId || input.briefId || input.generationReport || input.alt !== permit.alt ||
      input.caption !== '' || input.credit !== 'Illustration: Apropos Magazine / AI' || input.sourceUrl || input.originalUrl)
    throw invalid();
  const ref = submissionStore().collection.doc(row.id).collection('chatAssets').doc(permit.parentAssetId);
  const parent = (await (tx ? tx.get(ref) : ref.get())).data();
  if (!parent || parent.uid !== row.uid || parent.assetId !== permit.parentAssetId || parent.originalHash !== permit.parentHash ||
      parent.role !== 'cover' || parent.status !== 'attached' || !selectedAssetUrls(row, parent).includes(row.article.featuredImage || '')) throw invalid();
  return permit;
}

/** Only an exact-file, exact-current-version PERSONAL selection may replace the
 * approved cover. Called again inside the final update transaction, even when
 * approval history would not otherwise lock a URL. Other removed URLs fail. */
export async function assertExistingCoverReplacement(row: SubmissionRecord, removedUrls: string[],
  replacement: { assetId: string; url: string }, tx?: Transaction) {
  if (replacement.assetId !== existingCoverAssetId() || !removedUrls.length ||
      removedUrls.some(url => url !== row.article.featuredImage)) throw invalid();
  const ref = submissionStore().collection.doc(row.id).collection('chatAssets').doc(replacement.assetId);
  const asset = (await (tx ? tx.get(ref) : ref.get())).data();
  if (!asset || !existingCoverDisclosure(asset)) throw invalid();
  await assertExistingCoverIntent(row, asset.importInput || {}, tx);
  const choice = asset.personalSelection;
  if (!['uploaded', 'attached'].includes(asset.status) || asset.personalDecline || asset.url !== replacement.url ||
      asset.hash !== permit.sha256 || !asset.preserveOriginal ||
      asset.protectedContentHash !== imageProtectedContentHash(row.article) ||
      choice?.source !== 'personal-preview' || !choice.acceptedAt || choice.uid !== row.uid ||
      choice.assetId !== asset.assetId || choice.originalHash !== permit.sha256 || choice.revision !== row.revision ||
      choice.contentHash !== row.contentHash || choice.existingCoverAuthorizationId !== permit.id) throw invalid();
}
