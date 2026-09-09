import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getAdminDb, getAdminStorageBucket } from '@/lib/firebase-admin';
import { encodeWebp } from '@/lib/images/encode-webp';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { sourceUrl } from '@/lib/factcheck/source-reader';
import type { DeskStory } from '@/lib/editorial/desk-types';
import type { LivSelectedImage } from '@/lib/liv/image-selection';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
/** An explicit choice on a saved desk draft. No provider generation or CMS write. */
export async function prepareLivStoryImage(uid: string, input: { id: string; url: string; alt: string; credit: string }) {
  if (!uid || !/^[a-f0-9]{64}$/.test(input.id) || typeof input.url !== 'string' || input.url.length > 2000 ||
      typeof input.alt !== 'string' || input.alt.trim().length < 10 || input.alt.length > 300 ||
      typeof input.credit !== 'string' || input.credit.trim().length < 2 || input.credit.length > 200 ||
      /[<>\x00-\x1f]/.test(input.alt + input.credit)) throw new Error('image_selection_invalid');
  const url = sourceUrl(input.url).href;
  if ([...new URL(url).searchParams.keys()].some(key => /token|secret|password|signature|credential|api.?key/i.test(key))) throw new Error('image_selection_invalid');
  const db = getAdminDb();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  if (!db || !bucketName) throw new Error('image_storage_unavailable');
  const bucket = getAdminStorageBucket(bucketName);
  if (!bucket) throw new Error('image_storage_unavailable');
  const storyRef = db.collection('editorialDesks').doc(uid).collection('stories').doc(input.id);
  const lease = randomUUID();
  const claim = await db.runTransaction(async tx => {
    const row = (await tx.get(storyRef)).data() as (DeskStory & { mediaPreparationAttempts?: number[] }) | undefined;
    if (row?.status !== 'draft' || !row.article) throw new Error('image_draft_missing');
    const article = row.article;
    const candidate = article.imageSuggestions?.find(image => image.url === url);
    if (!candidate) throw new Error('image_not_in_research');
    const articleHash = livImageArticleHash(article);
    const id = hash(JSON.stringify([articleHash, url, input.alt.trim(), input.credit.trim()]));
    const assetRef = storyRef.collection('mediaAssets').doc(id);
    const asset = (await tx.get(assetRef)).data();
    if (asset?.status === 'stored') {
      if (asset.image?.id !== id || asset.image.articleHash !== articleHash || asset.image.sourceUrl !== url) throw new Error('image_cached_invalid');
      // Reselecting an earlier result must not download or overwrite its bytes.
      tx.update(storyRef, { 'article.selectedImage': asset.image, mediaSelectionLease: lease, cmsPreflight: null, updatedAt: new Date().toISOString() });
      return { cached: asset.image as LivSelectedImage, id, articleHash, sourcePageUrl: candidate.sourcePageUrl || null };
    }
    if (asset?.leaseUntil > Date.now()) throw new Error('image_already_processing');
    const attempts = (Array.isArray(row.mediaPreparationAttempts) ? row.mediaPreparationAttempts : [])
      .filter(time => Number.isFinite(time) && time > Date.now() - 3600_000);
    if (attempts.length >= 6) throw new Error('image_preparation_rate_limit');
    const storagePath = `editorial-images/liv/${hash(uid)}/${input.id}/${id}-${lease}.webp`;
    tx.set(assetRef, { status: 'processing', lease, leaseUntil: Date.now() + 330_000, articleHash, storagePath });
    tx.update(storyRef, { mediaSelectionLease: lease, mediaPreparationAttempts: [...attempts, Date.now()] });
    return { cached: null, id, articleHash, sourcePageUrl: candidate.sourcePageUrl || null };
  });
  if (claim.cached) return claim.cached;
  const assetRef = storyRef.collection('mediaAssets').doc(claim.id);
  try {
    const original = await readPublicMedia(url, 'image');
    const meta = await sharp(original, { limitInputPixels: 80_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages ?? 1) !== 1 ||
        !meta.width || !meta.height || meta.width < 1920 || meta.height < 1080) throw new Error('image_source_too_small_or_unsupported');
    const encoded = await encodeWebp(original, { maxSizeKB: 450, maxLongEdge: 1920, qualityStart: 85,
      qualityMin: 55, effort: 4, targetDimensions: { width: 1920, height: 1080 } });
    if (encoded.width !== 1920 || encoded.height !== 1080 || encoded.bytes > 450 * 1024) throw new Error('image_encode_policy_failed');
    const contentHash = hash(encoded.data);
    const storagePath = `editorial-images/liv/${hash(uid)}/${input.id}/${claim.id}-${lease}.webp`;
    const file = bucket.file(storagePath);
    const downloadToken = randomUUID();
    await file.save(encoded.data, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: downloadToken, sha256: contentHash } } });
    // Check the stored object, not just the upload response or the source URL.
    const [storedMeta] = await file.getMetadata();
    if (Number(storedMeta.size) !== encoded.bytes || storedMeta.contentType !== 'image/webp') throw new Error('image_storage_readback_failed');
    const [storedBytes] = await file.download({ validation: 'crc32c' });
    if (storedBytes.length !== encoded.bytes || hash(storedBytes) !== contentHash) throw new Error('image_storage_readback_failed');
    const image: LivSelectedImage = { id: claim.id, articleHash: claim.articleHash,
      url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`,
      storagePath, sourceUrl: url, sourcePageUrl: claim.sourcePageUrl, sourceHash: hash(original), contentHash,
      width: 1920, height: 1080, bytes: encoded.bytes, alt: input.alt.trim(), credit: input.credit.trim(),
      createdAt: new Date().toISOString(), rightsStatus: 'unverified', visualReview: 'pending' };
    await db.runTransaction(async tx => {
      const [latest, state] = await Promise.all([tx.get(storyRef), tx.get(assetRef)]);
      const row = latest.data() as DeskStory | undefined;
      if (state.data()?.lease !== lease || latest.data()?.mediaSelectionLease !== lease || row?.status !== 'draft' || !row.article ||
          livImageArticleHash(row.article) !== claim.articleHash) throw new Error('image_article_changed');
      tx.set(assetRef, { status: 'stored', image, leaseUntil: 0 });
      tx.update(storyRef, { 'article.selectedImage': image, cmsPreflight: null, updatedAt: image.createdAt });
    });
    return image;
  } catch {
    await db.runTransaction(async tx => {
      if ((await tx.get(assetRef)).data()?.lease === lease) tx.update(assetRef, { status: 'failed', leaseUntil: 0 });
    }).catch(() => {});
    // Do not expose upstream URLs, Storage internals or provider errors to the browser.
    throw new Error('image_prepare_failed');
  }
}
