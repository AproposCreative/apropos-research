import { incomingAudioPath, getPodcastBucket } from '@/lib/podcast/bucket';

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export function assertUploadSize(sizeBytes: number): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error('Ugyldig filstørrelse');
  }
  if (sizeBytes > MAX_BYTES) {
    throw new Error('Filen er for stor (maks 500 MB)');
  }
}

export function normalizeAudioContentType(ext: string, raw?: string): string {
  const lower = ext.toLowerCase();
  if (lower === '.mp3') return 'audio/mpeg';
  if (lower === '.m4a') return 'audio/mp4';
  if (raw && raw.startsWith('audio/')) return raw;
  return 'audio/mp4';
}

export async function createIncomingUploadSession(input: {
  slug: string;
  contentType: string;
}): Promise<{ uploadUri: string; storagePath: string }> {
  const bucket = getPodcastBucket();
  const storagePath = incomingAudioPath(input.slug);
  const file = bucket.file(storagePath);

  const [uploadUri] = await file.createResumableUpload({
    metadata: {
      contentType: input.contentType,
      cacheControl: 'private, max-age=0',
    },
  });

  return { uploadUri, storagePath };
}
