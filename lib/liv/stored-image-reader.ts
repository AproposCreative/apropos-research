import { createHash } from 'node:crypto';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import { readPublicMedia } from '@/lib/liv/public-media-reader';

/** Only our immutable public Liv assets. Other URLs retain the strict public reader. */
export async function readLivStoredImage(raw: string): Promise<Buffer> {
  const url = new URL(raw);
  if (url.hostname !== 'firebasestorage.googleapis.com') return readPublicMedia(raw, 'image');
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  if (!bucketName || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('liv_stored_image_invalid');
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
  const token = url.searchParams.get('token') || '';
  if (!match || decodeURIComponent(match[1]) !== bucketName || url.searchParams.get('alt') !== 'media' ||
      url.searchParams.size !== 2 || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token)) throw new Error('liv_stored_image_invalid');
  const storagePath = decodeURIComponent(match[2]);
  const asset = storagePath.match(/^editorial-images\/liv-daily\/[a-f0-9]{64}\/(?:hero|body-[12])-([a-f0-9]{64})\.webp$/);
  if (!asset) throw new Error('liv_stored_image_invalid');
  const bucket = getAdminStorageBucket(bucketName);
  if (!bucket) throw new Error('liv_stored_image_unavailable');
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  const tokens = String(metadata.metadata?.firebaseStorageDownloadTokens || '').split(',');
  if (!/^\d+$/.test(String(metadata.generation || '')) || !Number.isFinite(size) || size < 1 || size > 450 * 1024 || metadata.contentType !== 'image/webp' ||
      !tokens.includes(token) || metadata.metadata?.sha256 !== asset[1]) throw new Error('liv_stored_image_mismatch');
  // Read the immutable generation whose metadata was validated, not a later overwrite.
  const [bytes] = await bucket.file(storagePath, { generation: metadata.generation }).download({ validation: 'crc32c' });
  if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== asset[1]) throw new Error('liv_stored_image_mismatch');
  return bytes;
}
