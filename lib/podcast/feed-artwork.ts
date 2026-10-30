import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { getPodcastBucket } from './bucket';

export const PODCAST_ARTWORK_SIZE = 1400;
export const PODCAST_ARTWORK_MAX_BYTES = 450 * 1024;

/** Square directory artwork; contain preserves the entire approved photograph. */
export async function encodePodcastArtwork(input: Buffer): Promise<Buffer> {
  for (const quality of [88, 80, 70, 60]) {
    const bytes = await sharp(input, { limitInputPixels: 40_000_000, animated: false }).rotate()
      .resize(PODCAST_ARTWORK_SIZE, PODCAST_ARTWORK_SIZE, { fit: 'contain', background: '#111111' })
      .flatten({ background: '#111111' }).toColourspace('srgb').jpeg({ quality, mozjpeg: true }).toBuffer();
    if (bytes.length <= PODCAST_ARTWORK_MAX_BYTES) return bytes;
  }
  throw Error('podcast_artwork_size_limit');
}

export async function storePodcastArtwork(sourceUrl: string): Promise<{ imageURL: string; artworkSha256: string; artworkBytes: number }> {
  const bytes = await encodePodcastArtwork(await readPublicMedia(sourceUrl, 'image'));
  const artworkSha256 = createHash('sha256').update(bytes).digest('hex');
  const bucket = getPodcastBucket();
  const path = `podcasts/artwork/episodes/${artworkSha256}.jpg`, file = bucket.file(path);
  const token = randomUUID();
  try {
    await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: {
      contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token, sha256: artworkSha256 },
    } });
  } catch (error) {
    if ((error as { code?: number }).code !== 412) throw Error('podcast_artwork_upload_failed');
  }
  // Read back the stored bytes, including objects reused after a timeout or another worker.
  const [[stored], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  if (createHash('sha256').update(stored).digest('hex') !== artworkSha256) throw Error('podcast_artwork_readback_failed');
  const storedToken = String(metadata.metadata?.firebaseStorageDownloadTokens || '').split(',')[0];
  if (!storedToken) throw Error('podcast_artwork_public_url_missing');
  return { imageURL: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${storedToken}`,
    artworkSha256, artworkBytes: stored.length };
}
