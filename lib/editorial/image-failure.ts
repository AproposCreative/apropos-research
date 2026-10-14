import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore } from './submissions';
import { submissionId } from './submission-contract';
import { validateReference } from './image-reference';

function storage() {
  const name = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  const value = name && getAdminStorageBucket(name);
  if (!value) throw Error('mcp_submission_storage_unavailable');
  return value;
}
function project(row: Record<string, any>) {
  return { failureId: row.failureId, code: row.code, submissionId: row.submissionId, expectedRevision: row.expectedRevision,
    contentHash: row.contentHash, briefId: row.briefId ?? null, role: row.role, sectionId: row.sectionId ?? null,
    status: row.status, originalPreserved: row.originalPreserved === true, originalHash: row.originalHash ?? null,
    byteCount: row.byteCount ?? null, mimeType: row.mimeType ?? null, width: row.width ?? null, height: row.height ?? null,
    retentionError: row.retentionError ?? null, createdAt: row.createdAt, referenceHashes: row.referenceHashes ?? [],
    automaticRetryAllowed: false, regenerateImage: false, publicationApproval: false };
}
export class ImagePipelineFailure extends Error {
  constructor(code: string, readonly receipt: ReturnType<typeof project>) { super(code); }
}
export async function readImageFailures(uid: string, id: string) {
  await readSubmission(uid, id);
  const rows = await submissionStore().collection.doc(id).collection('imageFailures').limit(101).get();
  if (rows.size > 100) throw Error('mcp_submission_media_window_exceeded');
  return rows.docs.map(d => project(d.data()));
}

/** An attempted rejected import is NOT a generated-image approval. Preserve its
 * original in a private, non-executable quarantine, never in CMS or article UI.
 * The existing native file reader enforces URL, size, redirect and timeout rules.
 * Recording the claim before fetching prevents automatic repeated downloads.
 * Retained hashes allow recovery after a lost storage acknowledgement. */
export async function retainRejectedImage(uid: string, input: Record<string, any>, source: {
  identity: string; read: () => Promise<Buffer>;
}, code: string) {
  const row = await readSubmission(uid, input.submissionId);
  const { db, collection } = submissionStore();
  const failureId = cmsFieldHash({ uid, submissionId: row.id, requestId: input.requestId });
  const ref = collection.doc(row.id).collection('imageFailures').doc(failureId);
  const intentHash = cmsFieldHash({ input, fileId: source.identity });
  const existing = (await ref.get()).data();
  if (existing && existing.intentHash !== intentHash) throw Error('mcp_submission_idempotency_conflict');
  if (!existing) await db.runTransaction(async tx => {
    const prior = (await tx.get(ref)).data();
    if (prior && prior.intentHash !== intentHash) throw Error('mcp_submission_idempotency_conflict');
    if (!prior) tx.create(ref, { failureId, uid, submissionId: row.id, requestId: input.requestId,
      expectedRevision: input.expectedRevision, contentHash: row.contentHash, role: input.role, sectionId: input.sectionId ?? null,
      briefId: input.briefId ?? null, intentHash, fileId: source.identity, code,
      generationReport: input.generationReport ?? null, referenceHashes: input.generationReport?.referenceHashes ?? [],
      status: 'retention_pending', originalPreserved: false, createdAt: new Date().toISOString(),
      evidenceSource: 'client_reported_not_independently_verified', automaticRetryAllowed: false });
  });
  // Only the transaction winner reads the native file. A repeated request does
  // not generate, download or upload again. It may read an already stored object.
  const saved = (await ref.get()).data()!;
  if (existing) {
    if (!saved.originalPreserved && saved.storagePath && saved.originalHash) {
      try {
        const [bytes] = await storage().file(saved.storagePath).download({ validation: 'crc32c' });
        if (createHash('sha256').update(bytes).digest('hex') === saved.originalHash)
          await ref.update({ originalPreserved: true, status: 'rejected', retentionError: null });
      } catch { /* No retry upload and no false preservation claim. */ }
    }
    return project((await ref.get()).data()!);
  }
  const claimed = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current?.status !== 'retention_pending') return false;
    tx.update(ref, { status: 'retaining' }); return true;
  });
  if (!claimed) return project((await ref.get()).data()!);
  try {
    const bytes = await source.read();
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw Error('mcp_submission_image_invalid');
    const originalHash = createHash('sha256').update(bytes).digest('hex');
    const decoded = await validateReference(bytes).catch(() => null);
    const storagePath = `editorial-image-quarantine/${cmsFieldHash({ uid })}/${originalHash}`;
    await ref.update({ originalHash, storagePath, byteCount: bytes.length, mimeType: decoded?.mimeType ?? 'application/octet-stream',
      width: decoded?.width ?? null, height: decoded?.height ?? null, decoded: !!decoded });
    const target = storage().file(storagePath);
    try { await target.save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: 'application/octet-stream', contentDisposition: 'attachment' } }); }
    catch (error) { if (Number((error as { code?: number }).code) !== 412) throw error; }
    const [check] = await target.download({ validation: 'crc32c' });
    if (!check.equals(bytes)) throw Error('mcp_submission_storage_mismatch');
    await ref.update({ originalPreserved: true, status: 'rejected', retentionError: null });
  } catch (error) {
    // Native file IDs and supplied evidence remain even when the source has
    // expired. Never pretend that a file ID proves retained original bytes.
    const message = error instanceof Error ? error.message : '';
    await ref.update({ status: 'retention_unconfirmed', retentionError: /^mcp_[a-z_0-9]+$/.test(message) ? message : 'mcp_submission_original_retention_unconfirmed' });
  }
  return project((await ref.get()).data()!);
}

export const imageFailurePreviewInput = z.object({ submissionId, failureId: submissionId }).strict();
export async function previewImageFailure(uid: string, raw: unknown) {
  const input = imageFailurePreviewInput.parse(raw);
  await readSubmission(uid, input.submissionId);
  const row = (await submissionStore().collection.doc(input.submissionId).collection('imageFailures').doc(input.failureId).get()).data();
  if (!row || row.uid !== uid || !row.originalPreserved || !row.decoded) throw Error('mcp_submission_rejected_image_unavailable');
  const [bytes] = await storage().file(row.storagePath).download({ validation: 'crc32c' });
  const meta = await validateReference(bytes);
  if (meta.sha256 !== row.originalHash) throw Error('mcp_submission_reference_changed');
  if (bytes.length > 3_000_000) throw Error('mcp_submission_reference_bundle_too_large');
  return { receipt: project(row), image: { data: bytes.toString('base64'), mimeType: meta.mimeType },
    instruction: 'AFVIST original til fejlgennemgang, ikke artikelmedie eller godkendelse. Intet nyt billedkald.' };
}
