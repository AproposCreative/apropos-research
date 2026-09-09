import { downloadImage } from '@/lib/images/inspect-image';
import { randomUUID, createHash } from 'crypto';
import { encodeWebp } from '@/lib/images/encode-webp';
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
  /** Explicit fixed-canvas callers only; automatic thumbnails always resize. */
  preserveDimensions?: boolean;
  /** Exact editorial canvas; quality may change but dimensions must not shrink. */
  targetDimensions?: { width: number; height: number };
  /** Legacy compatibility option; actual byte and dimension policy determines processing. */
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

  const imageBuffer = await downloadImage(options.imageUrl, fetchTimeoutMs);
  const originalSizeKB = Math.round(imageBuffer.byteLength / 1024);
  const encoded = await encodeWebp(imageBuffer, {
    maxSizeKB, maxLongEdge, qualityStart, qualityMin, effort,
    preserveDimensions: options.preserveDimensions,
    targetDimensions: options.targetDimensions,
  });
  const processedBuffer = encoded.data;
  const processedSizeKB = Math.ceil(encoded.bytes / 1024);
  const metaWidth = encoded.width;
  const metaHeight = encoded.height;
  const currentQuality = encoded.quality;

  const fileNameOnly = buildSeoImageFileName({
    baseName: options.baseName,
    role: options.role || 'mobile',
    maxLongEdge: metaWidth,
    imageUrl: options.imageUrl,
  });
  const digest = createHash('sha256').update(processedBuffer).digest('hex').slice(0, 16);
  const fileName = `${datedFolder(folder)}/${fileNameOnly.replace(/\.webp$/, `-${digest}-${randomUUID()}.webp`)}`;

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
