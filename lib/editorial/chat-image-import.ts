import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import sharp from 'sharp';
import { z } from 'zod';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { readChatGptImage, readPublicMedia } from '@/lib/liv/public-media-reader';
import { encodeWebp } from '@/lib/images/encode-webp';
import { uploadImageGenCmsAsset, CmsAssetAccessError, assertCmsAssetWriteAccess } from '@/lib/image-gen/cms-asset';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore, updateSubmission } from './submissions';
import { submissionId, submissionInput } from './submission-contract';
import { lockProvidedAsset } from './provided-assets';
import { findBoundCoverByHash } from './submission-published-target';
import { generationReportInput, imageGenerationEvidence, assertGenerationContract } from './image-generation-evidence';
import { nativeImageFileInput, readRetainedReference } from './image-reference';
import { assertNoApprovedImageReplacement } from './approved-image-guard';
import { ImagePipelineFailure, readImageFailures, retainRejectedImage } from './image-failure';
import { imageProtectedContentHash } from './image-content-invariant';
import { preflightSubmissionImage } from './image-preflight';

export const chatImageImportInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  requestId: submissionInput.shape.requestId,
  file: nativeImageFileInput,
  kind: z.enum(['illustration', 'photo']), role: z.enum(['cover', 'body']),
  origin: z.enum(['user-upload', 'chatgpt-generated', 'chatgpt-edited', 'unspecified']).default('unspecified'),
  generationReport: generationReportInput.optional(),
  briefId: submissionId.optional(), sectionId: submissionId.optional(), replaceAssetId: submissionId.optional(),
  alt: z.string().min(3).max(500), caption: z.string().max(500), credit: z.string().min(3).max(500),
  sourceUrl: z.string().url().max(2000).optional(), originalUrl: z.string().url().max(2000).optional(),
}).strict();
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function bucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  const bucket = name && getAdminStorageBucket(name);
  if (!bucket) throw Error('mcp_submission_storage_unavailable');
  return bucket;
}

/** Paid work is impossible here. Original bytes and each import receipt survive
 * timeout. The temporary download URL is never persisted, echoed or logged. */
export async function importChatImage(uid: string, raw: unknown) {
  const { file, ...input } = chatImageImportInput.parse(raw);
  let downloaded: Promise<Buffer> | undefined;
  const source = { identity: file.file_id, mimeType: file.mime_type,
    read: () => downloaded ??= readChatGptImage(file.download_url), provenance: 'chatgpt-supplied-unverified' };
  try { return await importSuppliedImage(uid, input, source); }
  catch (error) {
    if (error instanceof ImagePipelineFailure) throw error;
    const code = error instanceof Error ? error.message : '';
    // Ownership/version/idempotency errors remain read-only. A rejected generated
    // file with an eligible contract error is quarantined, never silently lost.
    if (!['chatgpt-generated', 'chatgpt-edited'].includes(input.origin) ||
        !/^mcp_submission_(?:native_input_|generation_|generated_image_|canonical_prompt_|style_reference_|subject_reference_|reference_|output_inspection_|inspected_image_|brief_required|image_invalid|image_mime_mismatch|image_content_changed)/.test(code)) throw error;
    const receipt = await retainRejectedImage(uid, input, source, code);
    throw new ImagePipelineFailure(code, receipt);
  }
}

/** Shared durable storage/CMS/attachment operation. Only trusted server callers
 * provide bytes; a press URL is never disguised as a native ChatGPT fileParam. */
export async function importSuppliedImage(uid: string, input: Omit<z.infer<typeof chatImageImportInput>, 'file' | 'origin'> & { origin: z.infer<typeof chatImageImportInput>['origin'] | 'press-source' },
  source: { identity: string; mimeType?: string; read: () => Promise<Buffer>; provenance: string; evidence?: Record<string, unknown> }) {
  const row = await readSubmission(uid, input.submissionId);
  const assetId = cmsFieldHash({ uid, id: row.id, requestId: input.requestId });
  const metadata = input, file = { file_id: source.identity, mime_type: source.mimeType };
  const { expectedRevision: _expectedRevision, ...pressIntent } = metadata;
  // Press retries may explicitly rebase the unchanged attachment intent after
  // reading a newer revision. Native receipts retain their historical hash.
  let requestHash = cmsFieldHash({ ...(input.origin === 'press-source' ? pressIntent : metadata), fileId: file.file_id });
  const { db, collection } = submissionStore(), ref = collection.doc(row.id).collection('chatAssets').doc(assetId);
  const previous = (await ref.get()).data();
  if (previous && previous.requestHash !== requestHash) {
    // The native adapter can re-upload the same attachment under a new file ID.
    // Keep the original operation identity; admit a rotated reference only when
    // ALL instructions are unchanged and its actual bytes match the saved file.
    if (typeof previous.fileId !== 'string' ||
        previous.requestHash !== cmsFieldHash({ ...metadata, fileId: previous.fileId })) throw Error('mcp_submission_idempotency_conflict');
    const bytes = await source.read();
    if (hash(bytes) !== previous.originalHash) throw Error('mcp_submission_idempotency_conflict');
    await db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      if (old?.requestHash !== previous.requestHash || old.originalHash !== previous.originalHash) throw Error('mcp_submission_idempotency_conflict');
      tx.set(ref.collection('fileReferences').doc(cmsFieldHash({ fileId: file.file_id })), {
        fileId: file.file_id, originalHash: previous.originalHash, verifiedAt: new Date().toISOString(), source: 'native_reference_exact_bytes',
      });
    });
    requestHash = previous.requestHash;
  }
  if (previous?.status === 'attached') return { assetId, url: previous.url, revision: previous.revision, replay: true, paidAiCalls: 0,
    generationEvidence: previous.generationEvidence ?? null, regenerateImage: false };
  const attachment = previous && (await collection.doc(row.id).collection('updates').doc(cmsFieldHash({ requestId: `import-${assetId}` })).get()).data();
  if (attachment) {
    await ref.update({ status: 'attached', revision: attachment.revision });
    return { assetId, url: previous!.url, revision: attachment.revision, replay: true, paidAiCalls: 0,
      generationEvidence: previous!.generationEvidence ?? null, regenerateImage: false };
  }
  const generatedInChat = ['chatgpt-generated', 'chatgpt-edited'].includes(input.origin);
  if (generatedInChat) {
    const failures = await readImageFailures(uid, row.id);
    const failureId = cmsFieldHash({ uid, submissionId: row.id, requestId: input.requestId });
    const stopped = failures.find(f => f.failureId === failureId || (f.role === input.role && f.sectionId === (input.sectionId ?? null)));
    if (stopped) {
      const receipt = stopped.failureId === failureId ? await retainRejectedImage(uid, input, source, stopped.code) : stopped;
      throw new ImagePipelineFailure('mcp_submission_image_attempt_stopped', receipt);
    }
  }
  if (row.revision !== input.expectedRevision && previous?.status !== 'uploaded') throw Error('mcp_submission_revision_conflict');
  if (!['draft', 'blocked', 'prepared', 'published'].includes(row.status) ||
      (row.status === 'published' && !row.publishedTarget)) throw Error('mcp_submission_operation_pending');
  if (input.kind === 'illustration' && ['film', 'tv-series'].includes(row.article.subjectType || '')) throw Error('mcp_submission_film_requires_real_stills');
  const brief = input.briefId ? (await collection.doc(row.id).collection('chatBriefs').doc(input.briefId).get()).data() : null;
  if (input.briefId) {
    if (!brief || brief.uid !== uid || brief.contentHash !== row.contentHash || brief.role !== input.role ||
      (input.role === 'body' && brief.sectionId !== input.sectionId)) throw Error('mcp_submission_brief_changed');
  }
  assertGenerationContract(input, brief);
  if (generatedInChat) {
    if (!previous) {
      const preflight = await preflightSubmissionImage(uid, { submissionId: row.id, expectedRevision: input.expectedRevision,
        role: input.role, sectionId: input.sectionId, briefId: input.briefId,
        subjectReferencesRequired: brief?.subjectReferencesRequired === true, subjectReferenceIds: brief?.subjectReferenceIds || [] });
      if (!preflight.canGenerate) throw Error(preflight.blockers[0]);
    }
    if (brief?.protectedContentHash !== imageProtectedContentHash(row.article)) throw Error('mcp_submission_image_content_changed');
    if (!Array.isArray(brief?.retainedReferences) || brief.retainedReferences.length !== brief.requiredReferenceHashes.length)
      throw Error('mcp_submission_style_reference_required');
    for (const [index, reference] of brief.retainedReferences.entries()) {
      if (reference.sha256 !== brief.requiredReferenceHashes[index]) throw Error('mcp_submission_reference_changed');
      await readRetainedReference(reference);
    }
  }
  if (input.role === 'body' && !input.sectionId) throw Error('mcp_submission_anchor_changed');
  const snapshot = await readImageGenSnapshot(uid, `submission-${row.id}`);
  const section = input.sectionId ? snapshot.article.sections.find(s => s.id === input.sectionId) : null;
  if ((input.role === 'body' || generatedInChat) && !section) throw Error('mcp_submission_anchor_changed');
  const protectedContentHash = imageProtectedContentHash(row.article);
  const replaced = input.replaceAssetId ? (await collection.doc(row.id).collection('chatAssets').doc(input.replaceAssetId).get()).data() : null;
  if (input.replaceAssetId && (!replaced || replaced.uid !== uid || replaced.role !== input.role || replaced.status !== 'attached')) throw Error('mcp_submission_asset_not_found');
  await assertNoApprovedImageReplacement(row, [input.role === 'cover' ? row.article.featuredImage : replaced?.url].filter((url): url is string => !!url));
  // Cover replacement is an explicit role=cover operation; body replacement
  // must identify its retained asset. Existing unselected figures stay intact.
  const storage = bucket();
  let current = previous;
  if (current && generatedInChat && current.originalHash !== input.generationReport!.outputCheck!.sha256)
    throw Error('mcp_submission_inspected_image_mismatch');
  if (!current) {
    const bytes = await source.read();
    if ((await readImageFailures(uid, row.id)).some(f => f.originalHash === hash(bytes)))
      throw Error('mcp_submission_rejected_image_relabelled');
    if (!generatedInChat) {
      const known = await collection.doc(row.id).collection('chatAssets').limit(101).get();
      if (known.size > 100) throw Error('mcp_submission_media_window_exceeded');
      if (known.docs.some(doc => doc.data().originalHash === hash(bytes) && ['chatgpt-generated', 'chatgpt-edited'].includes(doc.data().origin)))
        throw Error('mcp_submission_generated_image_relabelled');
    }
    const decoder = sharp(bytes, { limitInputPixels: 80_000_000, failOn: 'warning' });
    const meta = await decoder.metadata().catch(() => { throw Error('mcp_submission_image_invalid'); });
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages || 1) !== 1 ||
      (meta.width || 0) < 800 || (meta.height || 0) < 500) throw Error('mcp_submission_image_invalid');
    await decoder.stats().catch(() => { throw Error('mcp_submission_image_invalid'); });
    if (generatedInChat && ((meta.width || 0) < 1200 || (meta.height || 0) < 800 || meta.width! <= meta.height!)) throw Error('mcp_submission_image_invalid');
    if (generatedInChat && input.generationReport!.outputCheck!.sha256 !== hash(bytes)) throw Error('mcp_submission_inspected_image_mismatch');
    // The file adapter may label a download as binary; decoded bytes, not the
    // host or optional filename, determine the actual raster format.
    if (file.mime_type && file.mime_type !== 'application/octet-stream' && file.mime_type !== `image/${meta.format}`) throw Error('mcp_submission_image_mime_mismatch');
    const dimensions = null;
    const originalHash = hash(bytes), path = `editorial-chat-images/${cmsFieldHash({ uid })}/${originalHash}`;
    const target = storage.file(path);
    try { await target.save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: `image/${meta.format}` } }); }
    catch (error) {
      if (Number((error as { code?: number }).code) !== 412) {
        // A lost save reply is not a failed save. Recover only identical bytes.
        const saved = await target.download({ validation: 'crc32c' }).catch(() => null);
        if (!saved?.[0].equals(bytes)) throw error;
      }
    }
    const [check] = await target.download({ validation: 'crc32c' });
    if (!check.equals(bytes)) throw Error('mcp_submission_storage_mismatch');
    const record = { ...metadata, uid, assetId, requestHash, originalHash, storagePath: path,
      dimensions, width: meta.width, height: meta.height, preserveOriginal: true, extension: meta.format === 'jpeg' ? 'jpg' : meta.format,
      selection: 'provided', locked: true, fallbackUsed: false,
      status: generatedInChat ? 'awaiting_personal_selection' : 'stored',
      ...(generatedInChat ? { importInput: metadata, contentHash: row.contentHash, protectedContentHash } : {}),
      fileId: file.file_id, credit: input.kind === 'illustration' && generatedInChat ? 'Illustration: Apropos Magazine / AI' : input.credit,
      provenance: source.provenance, ...(source.evidence ? { sourceEvidence: source.evidence } : {}),
      byteCount: bytes.length, mimeType: `image/${meta.format}`,
      rightsStatus: 'unknown', createdAt: new Date().toISOString(), exactPromptExecutionVerified: false };
    Object.assign(record, { generationEvidence: imageGenerationEvidence(input, brief) });
    await db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      if (old && old.requestHash !== requestHash) throw Error('mcp_submission_idempotency_conflict');
      if (!old) tx.create(ref, record);
    });
    current = (await ref.get()).data()!;
  }
  if (generatedInChat && (!current.personalSelection || current.personalSelection.uid !== uid ||
      current.personalSelection.originalHash !== current.originalHash || current.personalSelection.revision !== input.expectedRevision ||
      current.personalSelection.contentHash !== row.contentHash)) {
    return { assetId, revision: row.revision, importStatus: 'awaiting_personal_selection', originalHash: current.originalHash,
      originalPreserved: true, paidAiCalls: 0, publicationApproval: false, regenerateImage: false,
      generationEvidence: current.generationEvidence, instruction: 'Originalen er gemt privat, ikke i CMS eller artiklen. Vis preview_submission. Brugeren skal selv vælge denne fil før tilknytning. Ingen ny generation eller upload.' };
  }
  if (current.status !== 'uploaded') {
    const [original] = await storage.file(current.storagePath).download({ validation: 'crc32c' });
    if (hash(original) !== current.originalHash) throw Error('mcp_submission_storage_mismatch');
    // Old in-flight receipts keep their exact encoded expectation. New imports
    // preserve the selected bytes, dimensions and crop, including book lettering.
    const encoded = current.preserveOriginal ? { data: original } : await encodeWebp(original, { maxSizeKB: 450, maxLongEdge: 1920, qualityStart: 85, qualityMin: 55, effort: 4,
      ...(current.dimensions ? { targetDimensions: current.dimensions } : {}) });
    const encodedHash = hash(encoded.data);
    // The user may already have applied this exact file outside Apropos. Reuse
    // its verified identity instead of creating another asset just for a test.
    if (row.publishedTarget && input.role === 'cover' && !current.cmsAsset) {
      const existing = await findBoundCoverByHash(row.publishedTarget, encodedHash);
      if (existing) {
        await db.runTransaction(async tx => {
          const old = (await tx.get(ref)).data();
          if (old?.requestHash !== requestHash || !['stored', 'upload_attempted', 'allocation_blocked'].includes(old.status)) throw Error('mcp_submission_upload_unconfirmed');
          const recovery = { source: 'bound_cover_exact_bytes', checkedAt: new Date().toISOString(), cmsHash: row.publishedTarget!.fieldDataHash };
          tx.set(ref.collection('recoveries').doc(existing.id), { ...recovery, previousStatus: old.status, previousFailure: old.failure ?? null });
          tx.update(ref, { cmsAsset: existing, status: 'upload_attempted', hash: encodedHash, recovery });
        });
        current = (await ref.get()).data()!;
      }
    }
    if (current.status === 'allocation_blocked') {
      await assertCmsAssetWriteAccess();
      await db.runTransaction(async tx => {
        const old = (await tx.get(ref)).data();
        if (old?.status !== 'allocation_blocked' || old.requestHash !== requestHash) throw Error('mcp_submission_upload_unconfirmed');
        tx.create(ref.collection('failures').doc(String(Date.now())), old.failure);
        tx.update(ref, { status: 'stored' });
      });
      current = (await ref.get()).data()!;
    }
    if (current.status === 'upload_attempted') {
      if (!current.cmsAsset?.url) throw Error('mcp_submission_upload_unconfirmed');
      const readback = await readPublicMedia(current.cmsAsset.url, 'image');
      if (hash(readback) !== encodedHash) throw Error('mcp_submission_upload_unconfirmed');
    } else {
      const claimed = await db.runTransaction(async tx => {
        const old = (await tx.get(ref)).data();
        if (old?.status !== 'stored') return false;
        tx.update(ref, { status: 'upload_attempted', hash: encodedHash }); return true;
      });
      if (!claimed) throw Error('mcp_submission_upload_unconfirmed');
      try {
        await uploadImageGenCmsAsset(encoded.data, `apropos-${encodedHash}.${current.preserveOriginal ? current.extension : 'webp'}`, asset => ref.update({ cmsAsset: asset }).then(() => undefined),
          current.preserveOriginal ? { preserveOriginal: true } : undefined);
      } catch (error) {
        const access = error instanceof CmsAssetAccessError;
        await ref.update({ ...(access ? { status: 'allocation_blocked' } : {}), failure: {
          code: access ? error.message : 'mcp_submission_asset_upload_unconfirmed', stage: access ? 'cms_asset_access' : 'cms_asset_upload',
          ...(access ? { httpStatus: error.httpStatus, requiredScopes: ['assets:read', 'assets:write'] } : {}),
          checkedAt: new Date().toISOString(), originalPreserved: true, assetReady: false, regenerateImage: false } });
        throw Error(access ? error.message : 'mcp_submission_asset_upload_unconfirmed');
      }
    }
    current = (await ref.get()).data()!;
    await ref.update({ status: 'uploaded', url: current.cmsAsset.url, hash: encodedHash, failure: null,
      requestedAsset: { fileId: current.fileId, hash: current.originalHash },
      actualStoredAsset: { url: current.cmsAsset.url, hash: encodedHash }, fallbackUsed: false });
    current = (await ref.get()).data()!;
  }
  const article: Record<string, string> = {};
  if (current.preserveOriginal) await lockProvidedAsset(uid, row.id, current.url, current.hash);
  if (input.role === 'cover') Object.assign(article, { featuredImage: current.url, featuredImageAlt: input.alt, fotoCredit: current.credit });
  else {
    const $ = load(snapshot.article.content);
    const figure = $('<figure></figure>').attr('data-apropos-asset', assetId)
      .append($('<img>').attr({ src: current.url, alt: input.alt,
        ...(current.width && current.height ? { width: String(current.width), height: String(current.height) } : {}) }))
      .append($('<figcaption></figcaption>').text([input.caption, current.credit].filter(Boolean).join(' ')));
    if (replaced) {
      const old = $('img').filter((_, node) => $(node).attr('src') === replaced.url);
      if (old.length !== 1) throw Error('mcp_submission_anchor_changed');
      if (old.closest('figure').length) old.closest('figure').replaceWith(figure); else old.replaceWith(figure);
    } else {
      const target = $('p,h2,h3,blockquote,li').eq(section!.index);
      if (!target.length || target.text().replace(/\s+/gu, ' ').trim() !== section!.text) throw Error('mcp_submission_anchor_changed');
      target.after(figure);
    }
    article.content = $('body').html() || '';
  }
  const updated = await updateSubmission(uid, { submissionId: row.id, expectedRevision: input.expectedRevision,
    requestId: `import-${assetId}`, article }, { replaceUrls: input.role === 'cover' ? [row.article.featuredImage || ''] : replaced ? [replaced.url] : [], protectedContentHash });
  await ref.update({ status: 'attached', revision: updated.revision });
  return { assetId, url: current.url, revision: updated.revision, paidAiCalls: 0, provenance: current.provenance,
    generationEvidence: current.generationEvidence ?? null, regenerateImage: false,
    publicationApproval: false, instruction: 'Billedet er gemt. Ingen ny generation eller kvalitetsgodkendelse. Hent preview.' };
}
