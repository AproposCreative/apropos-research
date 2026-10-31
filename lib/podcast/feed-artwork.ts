import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { getPodcastBucket } from './bucket';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PODCAST_LOGO_SHA256 } from './artwork-style';

export const PODCAST_ARTWORK_SIZE = 1400;
export const PODCAST_ARTWORK_MAX_BYTES = 450 * 1024;

/** Scaled port of the app's PodcastPlayerManager.brandedNarrationArtwork:
 * centered aspect-fill photo, white bottom 19%, original black logo centered
 * at at most half the band's height / 70% of the square's width.
 * This owner-requested display crop never changes the original website image. */
export async function encodePodcastArtwork(input: Buffer | null): Promise<Buffer> {
  const side = PODCAST_ARTWORK_SIZE, bandHeight = Math.round(side * 0.19), bandTop = side - bandHeight;
  const logo = await readFile(path.join(process.cwd(), 'public/podcast/apropos-logo-black.svg'));
  if (createHash('sha256').update(logo).digest('hex') !== PODCAST_LOGO_SHA256) throw Error('podcast_logo_identity_mismatch');
  const logoImage = await sharp(logo, { density: 300 }).resize({ width: Math.round(side * 0.7), height: Math.round(bandHeight * 0.5), fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const base = input ? await sharp(input, { limitInputPixels: 80_000_000, animated: false }).rotate()
    .resize(side, side, { fit: 'cover', position: 'centre' }).flatten({ background: '#121212' }).toColourspace('srgb').png().toBuffer()
    : await sharp({ create: { width: side, height: side, channels: 3, background: '#121212' } }).png().toBuffer();
  const band = await sharp({ create: { width: side, height: bandHeight, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const composed = await sharp(base).composite([
    { input: band, left: 0, top: bandTop },
    { input: logoImage.data, left: Math.round((side - logoImage.info.width) / 2), top: bandTop + Math.round((bandHeight - logoImage.info.height) / 2) },
  ]).png().toBuffer();
  for (const quality of [88, 80, 70, 60]) {
    const bytes = await sharp(composed).toColourspace('srgb').jpeg({ quality, mozjpeg: true }).toBuffer();
    if (bytes.length <= PODCAST_ARTWORK_MAX_BYTES) return bytes;
  }
  throw Error('podcast_artwork_size_limit');
}

export async function storePodcastArtwork(sourceUrl: string | null): Promise<{ imageURL: string; artworkSha256: string; artworkBytes: number }> {
  const bytes = await encodePodcastArtwork(sourceUrl ? await readPublicMedia(sourceUrl, 'image') : null);
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
