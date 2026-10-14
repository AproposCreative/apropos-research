import sharp from 'sharp';
import type { DocumentData } from 'firebase-admin/firestore';
import { readSubmission, submissionStore } from './submissions';
import { readRetainedReference } from './image-reference';
import { imageProtectedContentHash } from './image-content-invariant';
import { importSuppliedImage } from './chat-image-import';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import type { SubmissionRecord } from './submission-contract';

/** Private originals are candidates, never decorative stand-ins for an attached
 * cover. No URL, storage path, consent bearer or download credential is exposed. */
export function projectImageCandidates(row: SubmissionRecord, assets: DocumentData[]) {
  return assets.filter(a => a.uid === row.uid && a.submissionId === row.id && a.importInput &&
    ['chatgpt-generated', 'chatgpt-edited'].includes(a.origin) && a.status !== 'attached')
    .map(a => ({ assetId: String(a.assetId), originalHash: String(a.originalHash), role: String(a.role),
      sectionId: String(a.sectionId), alt: String(a.alt), revision: Number(a.expectedRevision),
      current: a.expectedRevision === row.revision && a.contentHash === row.contentHash &&
        a.protectedContentHash === imageProtectedContentHash(row.article),
      selected: !!a.personalSelection, exactPromptExecutionVerified: false as const }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
}

export async function imageCandidatePreviews(uid: string, id: string, candidates: ReturnType<typeof projectImageCandidates> = []) {
  if (!candidates.length) return {};
  await readSubmission(uid, id);
  const images: Record<string, string> = {};
  for (const candidate of candidates.slice(0, 4)) {
    const asset = (await submissionStore().collection.doc(id).collection('chatAssets').doc(candidate.assetId).get()).data();
    if (!asset || asset.uid !== uid || asset.originalHash !== candidate.originalHash) throw Error('mcp_submission_preview_changed');
    const original = await readRetainedReference({ storagePath: asset.storagePath, sha256: asset.originalHash,
      mimeType: asset.mimeType, byteCount: asset.byteCount, width: asset.width, height: asset.height });
    const thumbnail = await sharp(Buffer.from(original.data, 'base64'), { limitInputPixels: 80_000_000 })
      .resize({ width: 1000, height: 800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    images[candidate.assetId] = 'data:image/webp;base64,' + thumbnail.toString('base64');
  }
  return images;
}

/** UI-only deliberate human choice. The model-facing import can stage but cannot
 * create this receipt. Stable import identity and retained bytes resume after
 * timeout; this never approves publication or attests hidden native input. */
export async function selectGeneratedImage(uid: string, id: string, revision: number, assetId: string, originalHash: string) {
  await readSubmission(uid, id);
  const { db, collection } = submissionStore(), rowRef = collection.doc(id), assetRef = rowRef.collection('chatAssets').doc(assetId);
  const asset = await db.runTransaction(async tx => {
    const row = (await tx.get(rowRef)).data() as SubmissionRecord, saved = (await tx.get(assetRef)).data();
    if (!saved || saved.uid !== uid || saved.submissionId !== id || saved.originalHash !== originalHash ||
      saved.expectedRevision !== revision || !saved.importInput ||
      saved.requestHash !== cmsFieldHash({ ...saved.importInput, fileId: saved.fileId })) throw Error('mcp_submission_preview_changed');
    if (saved.status === 'attached' && saved.personalSelection) return saved;
    if (!row || row.uid !== uid || row.revision !== revision || row.contentHash !== saved.contentHash ||
      imageProtectedContentHash(row.article) !== saved.protectedContentHash) throw Error('mcp_submission_preview_changed');
    if (!['draft', 'blocked', 'prepared'].includes(row.status)) throw Error('mcp_submission_operation_pending');
    if (!saved.personalSelection) {
      const receipt = { uid, revision, contentHash: row.contentHash, assetId, originalHash,
        acceptedAt: new Date().toISOString(), source: 'personal-preview', publicationApproval: false, exactPromptExecutionVerified: false };
      tx.create(assetRef.collection('selections').doc(originalHash), receipt);
      tx.update(assetRef, { personalSelection: receipt, status: 'stored' });
    }
    return saved;
  });
  return importSuppliedImage(uid, asset.importInput, { identity: asset.fileId, mimeType: asset.mimeType, provenance: asset.provenance,
    read: async () => {
      const file = await readRetainedReference({ storagePath: asset.storagePath, sha256: asset.originalHash,
        mimeType: asset.mimeType, byteCount: asset.byteCount, width: asset.width, height: asset.height });
      return Buffer.from(file.data, 'base64');
    } });
}
