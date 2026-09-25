import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { encodeWebp } from '@/lib/images/encode-webp';
import { chooseLivHeroDimensions } from './hero-dimensions';
import { livImageArticleHash } from './article-image-hash';
import type { GeneratedArticle } from './generate-article';
import type { z } from 'zod';
import type { suppliedApprovalInput } from './supplied-approval';

/** User-selected cover only. Original pixels retained; no AI calls, invented
 * photographer or removal of printed book text. Storage is content-addressed. */
export async function attachSuppliedCover(article: GeneratedArticle, cover: NonNullable<z.infer<typeof suppliedApprovalInput>['cover']>) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cover.base64) || /[<>\x00-\x1f]/.test(cover.alt + cover.credit)) throw Error('liv_supplied_cover_invalid');
  const original = Buffer.from(cover.base64, 'base64');
  const meta = await sharp(original, { limitInputPixels: 40000000 }).metadata();
  const dimensions = chooseLivHeroDimensions(meta.width || 0, meta.height || 0, meta.orientation);
  if (!dimensions || !['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages ?? 1) !== 1) throw Error('liv_supplied_cover_invalid');
  const image = await encodeWebp(original, { maxSizeKB: 450, maxLongEdge: 1920, qualityStart: 85, qualityMin: 70, targetDimensions: dimensions });
  const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const bucket = getAdminStorageBucket(); if (!bucket) throw Error('liv_supplied_cover_storage');
  const contentHash = hash(image.data), sourceHash = hash(original);
  const storagePath = `editorial-images/liv-supplied/${sourceHash}/hero-${contentHash}.webp`;
  const file = bucket.file(storagePath); let token: string = randomUUID();
  try { await file.save(image.data, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable', metadata: { firebaseStorageDownloadTokens: token, sha256: contentHash } } });
  } catch (e) { if (Number((e as {code?:unknown}).code) !== 412) throw e;
    const [saved] = await file.getMetadata(); const prior = saved.metadata?.firebaseStorageDownloadTokens;
    if (typeof prior !== 'string' || !/^[a-f0-9-]{36}$/.test(prior)) throw Error('liv_supplied_cover_storage'); token = prior;
  }
  const [readback] = await file.download({validation:'crc32c'});
  if (hash(readback) !== contentHash) throw Error('liv_supplied_cover_storage');
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  const evidence = { ...dimensions, url, storagePath, contentHash, sourceHash, bytes: image.bytes, role: 'hero' as const,
    alt: cover.alt, caption: cover.alt, credit: cover.credit, sourceUrl: null, sourcePageUrl: null, kind: 'photography' as const };
  return { ...article, preparedMedia: article.preparedMedia!.map(m => m.role === 'hero' ? evidence : m),
    selectedImage: { ...dimensions, id: `supplied-${contentHash}`, articleHash: livImageArticleHash(article), url, storagePath,
      contentHash, sourceHash, bytes: image.bytes, alt: cover.alt, credit: cover.credit, sourceUrl: url, sourcePageUrl: null,
      createdAt: new Date().toISOString(), rightsStatus: 'unverified' as const, visualReview: 'editorial' as const } };
}
