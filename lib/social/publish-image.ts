import { createHash } from 'node:crypto';
import { getAdminStorageBucket } from '@/lib/firebase-admin';
import type { SocialPublishInput } from './publish-types';
/** Verify the exact exported JPEG, not a client-provided image digest or arbitrary
 * remote URL. Existing upload rules/path stay intact. No SSRF or public proxy. */
export async function verifyPublishImage(uid: string, input: SocialPublishInput) {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw Error('social_image_storage_unavailable');
  const url = new URL(input.imageUrl);
  const objectName = `instagram-publish/${uid}-${input.imageSha256}.jpg`;
  if (url.origin !== 'https://firebasestorage.googleapis.com' ||
    url.pathname !== `/v0/b/${bucketName}/o/${encodeURIComponent(objectName)}` || url.searchParams.get('alt') !== 'media') {
    throw Error('social_image_identity_invalid');
  }
  const bucket = getAdminStorageBucket(bucketName);
  if (!bucket) throw Error('social_image_storage_unavailable');
  const file = bucket.file(objectName), [metadata] = await file.getMetadata();
  if (!Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) <= 0 || Number(metadata.size) > 8 * 1024 * 1024 || metadata.contentType !== 'image/jpeg') throw Error('social_image_invalid');
  const [bytes] = await file.download();
  if (bytes.length > 8 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
    createHash('sha256').update(bytes).digest('hex') !== input.imageSha256) throw Error('social_image_hash_mismatch');
}
