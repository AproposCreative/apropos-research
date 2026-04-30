import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { env } from '@/lib/config/env';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';

export type OptimizeAndUploadImageOptions = {
  imageUrl: string;
  maxSizeKB?: number;
  maxLongEdge?: number;
  qualityStart?: number;
  qualityMin?: number;
  folder?: string;
  baseName?: string;
  role?: string;
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

function slugifyForFile(input: string): string {
  const normalized = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized.slice(0, 90) || 'apropos-image';
}

function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

export function buildSeoImageFileName(options: {
  baseName?: string;
  role?: string;
  maxLongEdge?: number;
  imageUrl?: string;
}): string {
  const base = slugifyForFile(options.baseName || 'apropos-image');
  const role = slugifyForFile(options.role || 'mobile');
  const width = options.maxLongEdge || 800;
  const hash = shortHash(`${base}|${role}|${options.imageUrl || ''}`);
  return `${base}-${role}-${width}w-${hash}.webp`;
}

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

  const imageResponse = await fetch(options.imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const originalSizeKB = Math.round(imageBuffer.byteLength / 1024);
  const originalMeta = await sharp(imageBuffer).metadata();

  let currentQuality = qualityStart;
  let currentLongEdge = maxLongEdge;
  let processedBuffer: Buffer | null = null;
  let metaWidth: number | null = null;
  let metaHeight: number | null = null;

  while (currentLongEdge >= 280) {
    currentQuality = qualityStart;
    while (currentQuality >= qualityMin) {
      processedBuffer = await sharp(imageBuffer)
        .rotate()
        .resize({
          width: currentLongEdge,
          height: currentLongEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: currentQuality,
          effort: 6,
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
