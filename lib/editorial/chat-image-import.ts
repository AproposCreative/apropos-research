import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import sharp from 'sharp';
import { z } from 'zod';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { readChatGptImage, readPublicMedia } from '@/lib/liv/public-media-reader';
import { encodeWebp } from '@/lib/images/encode-webp';
import { uploadImageGenCmsAsset } from '@/lib/image-gen/cms-asset';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore, updateSubmission } from './submissions';
import { submissionId, submissionInput } from './submission-contract';
import { lockProvidedAsset } from './provided-assets';

export const chatImageImportInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  requestId: submissionInput.shape.requestId,
  file: z.object({ download_url: z.string().url().max(16000), file_id: z.string().min(1).max(300),
    mime_type: z.string().max(100).optional(), file_name: z.string().max(300).optional() }).strict(),
  kind: z.enum(['illustration', 'photo']), role: z.enum(['cover', 'body']),
  origin: z.enum(['user-upload', 'chatgpt-generated', 'chatgpt-edited', 'unspecified']).default('unspecified'),
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
  const input = chatImageImportInput.parse(raw), row = await readSubmission(uid, input.submissionId);
  const assetId = cmsFieldHash({ uid, id: row.id, requestId: input.requestId });
  const { file, ...metadata } = input;
  const requestHash = cmsFieldHash({ ...metadata, fileId: file.file_id });
  const { db, collection } = submissionStore(), ref = collection.doc(row.id).collection('chatAssets').doc(assetId);
  const previous = (await ref.get()).data();
  if (previous && previous.requestHash !== requestHash) throw Error('mcp_submission_idempotency_conflict');
  if (previous?.status === 'attached') return { assetId, url: previous.url, revision: previous.revision, replay: true, paidAiCalls: 0 };
  const attachment = previous && (await collection.doc(row.id).collection('updates').doc(cmsFieldHash({ requestId: `import-${assetId}` })).get()).data();
  if (attachment) {
    await ref.update({ status: 'attached', revision: attachment.revision });
    return { assetId, url: previous!.url, revision: attachment.revision, replay: true, paidAiCalls: 0 };
  }
  if (row.revision !== input.expectedRevision && previous?.status !== 'uploaded') throw Error('mcp_submission_revision_conflict');
  if (!['draft', 'blocked', 'prepared', 'published'].includes(row.status) ||
      (row.status === 'published' && !row.publishedTarget)) throw Error('mcp_submission_operation_pending');
  if (input.kind === 'illustration' && ['film', 'tv-series'].includes(row.article.subjectType || '')) throw Error('mcp_submission_film_requires_real_stills');
  const generatedInChat = ['chatgpt-generated', 'chatgpt-edited'].includes(input.origin);
  // Older scanned clients cannot send origin. A supplied existing file is not
  // evidence of a new generation or of having followed an Apropos brief.
  if (input.kind === 'illustration' && generatedInChat && !input.briefId) throw Error('mcp_submission_brief_required');
  if (input.briefId) {
    const brief = (await collection.doc(row.id).collection('chatBriefs').doc(input.briefId).get()).data();
    if (!brief || brief.uid !== uid || brief.contentHash !== row.contentHash || brief.role !== input.role ||
      (input.role === 'body' && brief.sectionId !== input.sectionId)) throw Error('mcp_submission_brief_changed');
  }
  if (input.role === 'body' && !input.sectionId) throw Error('mcp_submission_anchor_changed');
  const snapshot = await readImageGenSnapshot(uid, `submission-${row.id}`);
  const section = input.sectionId ? snapshot.article.sections.find(s => s.id === input.sectionId) : null;
  if (input.role === 'body' && !section) throw Error('mcp_submission_anchor_changed');
  const replaced = input.replaceAssetId ? (await collection.doc(row.id).collection('chatAssets').doc(input.replaceAssetId).get()).data() : null;
  if (input.replaceAssetId && (!replaced || replaced.uid !== uid || replaced.role !== input.role || replaced.status !== 'attached')) throw Error('mcp_submission_asset_not_found');
  // Cover replacement is an explicit role=cover operation; body replacement
  // must identify its retained asset. Existing unselected figures stay intact.
  const storage = bucket();
  let current = previous;
  if (!current) {
    const bytes = await readChatGptImage(file.download_url);
    const meta = await sharp(bytes, { limitInputPixels: 80_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages || 1) !== 1 ||
      (meta.width || 0) < 800 || (meta.height || 0) < 500) throw Error('mcp_submission_image_invalid');
    // The file adapter may label a download as binary; decoded bytes, not the
    // host or optional filename, determine the actual raster format.
    if (file.mime_type && file.mime_type !== 'application/octet-stream' && file.mime_type !== `image/${meta.format}`) throw Error('mcp_submission_image_mime_mismatch');
    const dimensions = null;
    const originalHash = hash(bytes), path = `editorial-chat-images/${cmsFieldHash({ uid })}/${originalHash}`;
    const target = storage.file(path);
    try { await target.save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: `image/${meta.format}` } }); }
    catch (error) { if (Number((error as { code?: number }).code) !== 412) throw error; }
    const [check] = await target.download({ validation: 'crc32c' });
    if (!check.equals(bytes)) throw Error('mcp_submission_storage_mismatch');
    const record = { ...metadata, uid, assetId, requestHash, originalHash, storagePath: path,
      dimensions, width: meta.width, height: meta.height, preserveOriginal: true, extension: meta.format === 'jpeg' ? 'jpg' : meta.format,
      selection: 'provided', locked: true, fallbackUsed: false,
      status: 'stored', fileId: file.file_id, credit: input.kind === 'illustration' && generatedInChat ? 'Illustration: Apropos Magazine / AI' : input.credit,
      provenance: 'chatgpt-supplied-unverified', rightsStatus: 'unknown', createdAt: new Date().toISOString(), exactPromptExecutionVerified: false };
    await db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      if (old && old.requestHash !== requestHash) throw Error('mcp_submission_idempotency_conflict');
      if (!old) tx.create(ref, record);
    });
    current = (await ref.get()).data()!;
  }
  if (current.status !== 'uploaded') {
    const [original] = await storage.file(current.storagePath).download({ validation: 'crc32c' });
    if (hash(original) !== current.originalHash) throw Error('mcp_submission_storage_mismatch');
    // Old in-flight receipts keep their exact encoded expectation. New imports
    // preserve the selected bytes, dimensions and crop, including book lettering.
    const encoded = current.preserveOriginal ? { data: original } : await encodeWebp(original, { maxSizeKB: 450, maxLongEdge: 1920, qualityStart: 85, qualityMin: 55, effort: 4,
      ...(current.dimensions ? { targetDimensions: current.dimensions } : {}) });
    const encodedHash = hash(encoded.data);
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
      } catch {
        await ref.update({ failure: { code: 'mcp_submission_asset_upload_unconfirmed', stage: 'cms_asset_upload',
          checkedAt: new Date().toISOString(), originalPreserved: true, assetReady: false, regenerateImage: false } });
        throw Error('mcp_submission_asset_upload_unconfirmed');
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
    requestId: `import-${assetId}`, article }, { replaceUrls: input.role === 'cover' ? [row.article.featuredImage || ''] : replaced ? [replaced.url] : [] });
  await ref.update({ status: 'attached', revision: updated.revision });
  return { assetId, url: current.url, revision: updated.revision, paidAiCalls: 0, provenance: current.provenance,
    publicationApproval: false, instruction: 'Billedet er gemt. Ingen ny generation eller kvalitetsgodkendelse. Hent preview.' };
}
