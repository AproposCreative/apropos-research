import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { env } from '@/lib/config/env';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { buildSeoImageFileName } from '@/lib/images/seo-image-name';
import { logger } from '@/lib/logger';

export { buildSeoImageFileName } from '@/lib/images/seo-image-name';

export type OptimizeAndUploadImageOptions = {
  imageUrl: string;
  maxSizeKB?: number;
  maxLongEdge?: number;
  qualityStart?: number;
  qualityMin?: number;
  folder?: string;
  baseName?: string;
  role?: string;
  /** Bevar original opløsning — kun format/komprimering (desktop thumb). */
  preserveDimensions?: boolean;
  /** Spring over hvis original er mindre (undtagen PNG). */
  minOriginalKB?: number;
  /** WebP encode-effort (1-6). Lavere = hurtigere (vigtigt for store fotos/timeouts). Default 6. */
  effort?: number;
  /** Timeout for download af kilde-billedet i ms. Default 30s. */
  fetchTimeoutMs?: number;
};

export type OptimizeAndUploadImageResult = {
  url: string;
  fileName: string;
  originalSizeKB: number;
  processedSizeKB: number;
  width: number | null;
  height: number | null;
  quality: number;
};

async function uploadToFirebaseStorage(
  bucket: string,
  name: string,
  content: Buffer,
  contentType = 'image/webp'
): Promise<string> {
  const downloadToken = randomUUID();
  const storageBucket = getAdminStorageBucket(bucket);
  if (!storageBucket) {
    throw new Error('Firebase Admin Storage is not configured');
  }

  await storageBucket.file(name).save(content, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(name)}?alt=media&token=${downloadToken}`;
}

function resolveBucketCandidates(): string[] {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('Missing FIREBASE_ADMIN_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  }
  const explicitBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  return [
    explicitBucket,
    `${projectId}.appspot.com`,
    `${projectId}.firebasestorage.app`,
  ].filter(Boolean) as string[];
}

function datedFolder(folder: string): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${folder.replace(/^\/+|\/+$/g, '')}/${yyyy}/${mm}`;
}

export async function optimizeAndUploadImage(
  options: OptimizeAndUploadImageOptions
): Promise<OptimizeAndUploadImageResult> {
  const maxSizeKB = Math.max(20, Math.round(options.maxSizeKB ?? 160));
  const maxLongEdge = Math.max(200, Math.round(options.maxLongEdge ?? 800));
  const qualityStart = Math.min(95, Math.max(40, Math.round(options.qualityStart ?? 82)));
  const qualityMin = Math.min(qualityStart, Math.max(30, Math.round(options.qualityMin ?? 55)));
  const folder = options.folder || 'webflow/mobile-images';
  const effort = Math.min(6, Math.max(1, Math.round(options.effort ?? 6)));
  const fetchTimeoutMs = Math.max(5000, Math.round(options.fetchTimeoutMs ?? 30000));

  const imageResponse = await fetch(options.imageUrl, {
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const originalSizeKB = Math.round(imageBuffer.byteLength / 1024);
  const originalMeta = await sharp(imageBuffer).metadata();
  const isPng = (originalMeta.format || '').toLowerCase() === 'png';
  const minOriginalKB = Math.max(0, Math.round(options.minOriginalKB ?? 0));
  if (
    minOriginalKB > 0 &&
    !isPng &&
    originalSizeKB < minOriginalKB &&
    !options.preserveDimensions
  ) {
    throw new Error(`Billede er allerede lille nok (${originalSizeKB} KB)`);
  }

  let currentQuality = qualityStart;
  let currentLongEdge = maxLongEdge;
  let processedBuffer: Buffer | null = null;
  let metaWidth: number | null = originalMeta.width ?? null;
  let metaHeight: number | null = originalMeta.height ?? null;

  if (options.preserveDimensions) {
    // Roter én gang til en arbejds-buffer, så vi ikke gen-dekoder originalen i hver iteration.
    const rotatedBuffer = await sharp(imageBuffer).rotate().toBuffer();
    while (currentQuality >= qualityMin) {
      processedBuffer = await sharp(rotatedBuffer)
        .webp({
          quality: currentQuality,
          effort,
          lossless: false,
        })
        .toBuffer();

      const processedSizeKB = Math.round(processedBuffer.byteLength / 1024);
      if (processedSizeKB <= maxSizeKB || currentQuality <= qualityMin) {
        break;
      }
      currentQuality -= 5;
    }
  } else {
    // Forrresize én gang til arbejds-buffer; kvalitets-loopet gen-encoder så det lille
    // billede i stedet for at dekode + resize den fulde original hver gang (stor CPU/memory-gevinst).
    let workBuffer = await sharp(imageBuffer)
      .rotate()
      .resize({
        width: currentLongEdge,
        height: currentLongEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();

    while (currentLongEdge >= 280) {
      currentQuality = qualityStart;
      while (currentQuality >= qualityMin) {
        processedBuffer = await sharp(workBuffer)
          .webp({
            quality: currentQuality,
            effort,
            lossless: false,
          })
          .toBuffer();

        const processedSizeKB = Math.round(processedBuffer.byteLength / 1024);
        const meta = await sharp(processedBuffer).metadata();
        metaWidth = meta.width ?? null;
        metaHeight = meta.height ?? null;
        if (processedSizeKB <= maxSizeKB) {
          break;
        }
        currentQuality -= 7;
      }

      if (!processedBuffer || Math.round(processedBuffer.byteLength / 1024) <= maxSizeKB) {
        break;
      }
      currentLongEdge = Math.round(currentLongEdge * 0.88);
      workBuffer = await sharp(imageBuffer)
        .rotate()
        .resize({
          width: currentLongEdge,
          height: currentLongEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toBuffer();
    }
  }

  if (!processedBuffer) {
    throw new Error('Image processing failed');
  }

  const processedSizeKB = Math.round(processedBuffer.byteLength / 1024);
  if (!metaWidth || !metaHeight) {
    const finalMeta = await sharp(processedBuffer).metadata();
    metaWidth = finalMeta.width ?? originalMeta.width ?? null;
    metaHeight = finalMeta.height ?? originalMeta.height ?? null;
  }

  const fileNameOnly = buildSeoImageFileName({
    baseName: options.baseName,
    role: options.role || 'mobile',
    maxLongEdge,
    imageUrl: options.imageUrl,
  });
  const fileName = `${datedFolder(folder)}/${fileNameOnly}`;

  let lastError: unknown = null;
  for (const bucket of resolveBucketCandidates()) {
    try {
      const url = await uploadToFirebaseStorage(bucket, fileName, processedBuffer, 'image/webp');
      return {
        url,
        fileName,
        originalSizeKB,
        processedSizeKB,
        width: metaWidth,
        height: metaHeight,
        quality: currentQuality,
      };
    } catch (e) {
      lastError = e;
      logger.warn('[images] upload attempt failed', {
        bucket,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Upload failed'));
}
