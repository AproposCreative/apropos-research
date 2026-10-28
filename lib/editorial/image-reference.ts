import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { readChatGptImage } from '@/lib/liv/public-media-reader';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore } from './submissions';
import { submissionId, submissionInput } from './submission-contract';

export const nativeImageFileInput = z.object({ download_url: z.string().url().max(16000), file_id: z.string().min(1).max(300),
  mime_type: z.string().max(100).optional(), file_name: z.string().max(300).optional() }).strict();
export const imageReferenceInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  requestId: submissionInput.shape.requestId, file: nativeImageFileInput,
  purpose: z.enum(['user-uploaded-subject-photo', 'book-cover-artwork', 'book-mockup-layout']),
  sourceUrl: z.string().url().max(2000).refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; }).optional(),
  sourceCredit: z.string().min(3).max(300).optional(),
}).strict();
export type RetainedReference = { storagePath: string; sha256: string; mimeType: string; byteCount: number; width: number; height: number };
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function storage() {
  const name = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  const bucket = name && getAdminStorageBucket(name);
  if (!bucket) throw Error('mcp_submission_storage_unavailable');
  return bucket;
}
export async function validateReference(bytes: Buffer) {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw Error('mcp_submission_reference_invalid');
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' }), meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages || 1) !== 1 || !meta.width || !meta.height) throw Error('invalid');
    await image.stats(); // Full raster decode, not just a plausible header.
    return { sha256: sha256(bytes), mimeType: `image/${meta.format}`, byteCount: bytes.length, width: meta.width, height: meta.height };
  } catch { throw Error('mcp_submission_reference_invalid'); }
}
/** Immutable private originals. Never transform a reference or store its signed URL. */
export async function retainReference(uid: string, bytes: Buffer): Promise<RetainedReference> {
  const meta = await validateReference(bytes);
  const storagePath = `editorial-image-references/${cmsFieldHash({ uid })}/${meta.sha256}`, file = storage().file(storagePath);
  try { await file.save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: meta.mimeType } }); }
  catch (error) { if (Number((error as { code?: number }).code) !== 412) throw error; }
  const [check] = await file.download({ validation: 'crc32c' });
  if (!check.equals(bytes)) throw Error('mcp_submission_reference_changed');
  return { ...meta, storagePath };
}
export async function readRetainedReference(reference: RetainedReference) {
  if (!reference?.storagePath || !reference.sha256) throw Error('mcp_submission_reference_missing');
  const [bytes] = await storage().file(reference.storagePath).download({ validation: 'crc32c' });
  if (sha256(bytes) !== reference.sha256) throw Error('mcp_submission_reference_changed');
  const meta = await validateReference(bytes);
  if (meta.mimeType !== reference.mimeType) throw Error('mcp_submission_reference_changed');
  return { data: bytes.toString('base64'), mimeType: meta.mimeType };
}
export async function storeSubmissionImageReference(uid: string, raw: unknown) {
  const { file, ...input } = imageReferenceInput.parse(raw), row = await readSubmission(uid, input.submissionId);
  if (input.purpose !== 'user-uploaded-subject-photo' &&
      (row.article.subjectType !== 'literature' || !row.article.bookTitle || !row.article.bookAuthor)) throw Error('mcp_submission_book_mockup_requires_book');
  const referenceId = cmsFieldHash({ uid, submissionId: row.id, requestId: input.requestId });
  const { db, collection } = submissionStore(), ref = collection.doc(row.id).collection('imageReferences').doc(referenceId);
  const intentHash = cmsFieldHash(input), previous = (await ref.get()).data();
  if (previous && previous.intentHash !== intentHash) throw Error('mcp_submission_idempotency_conflict');
  if (previous?.fileId === file.file_id) {
    const { storagePath: _path, ...publicReference } = previous.reference as RetainedReference;
    return { referenceId, ...publicReference, replay: true, paidAiCalls: 0 };
  }
  if (!previous && row.revision !== input.expectedRevision) throw Error('mcp_submission_revision_conflict');
  const bytes = await readChatGptImage(file.download_url), meta = await validateReference(bytes);
  if (file.mime_type && !['application/octet-stream', meta.mimeType].includes(file.mime_type)) throw Error('mcp_submission_image_mime_mismatch');
  if (previous && meta.sha256 !== previous.reference.sha256) throw Error('mcp_submission_idempotency_conflict');
  const reference = previous?.reference || await retainReference(uid, bytes);
  await db.runTransaction(async tx => {
    const current = (await tx.get(collection.doc(row.id))).data(), prior = (await tx.get(ref)).data();
    if (!current || current.uid !== uid) throw Error('mcp_submission_not_found');
    if (prior) {
      if (prior.intentHash !== intentHash || prior.reference.sha256 !== reference.sha256) throw Error('mcp_submission_idempotency_conflict');
      return;
    }
    if (current.revision !== input.expectedRevision) throw Error('mcp_submission_revision_conflict');
    tx.create(ref, { ...input, uid, referenceId, intentHash, fileId: file.file_id, reference, createdAt: new Date().toISOString(), rightsStatus: 'unknown' });
  });
  const { storagePath: _path, ...publicReference } = reference as RetainedReference;
  return { referenceId, ...publicReference, replay: !!previous, paidAiCalls: 0 };
}
