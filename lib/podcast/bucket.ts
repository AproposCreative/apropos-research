import { env } from '@/lib/config/env';
import { getAdminStorageBucket } from '@/lib/firebase-admin';

export function resolvePodcastBucketName(): string {
  const candidates = [
    process.env.PODCAST_STORAGE_BUCKET?.trim(),
    env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET?.trim(),
    // Legacy appspot.com — kun fallback (browser uploader bruger firebasestorage.app)
    process.env.FIREBASE_STORAGE_BUCKET?.trim(),
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
      ? `${process.env.FIREBASE_ADMIN_PROJECT_ID}.appspot.com`
      : undefined,
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()
      ? `${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`
      : undefined,
  ].filter(Boolean) as string[];

  const unique = [...new Set(candidates)];
  if (unique.length === 0) {
    throw new Error('Ingen Firebase Storage bucket konfigureret');
  }
  return unique[0]!;
}

export function getPodcastBucket() {
  const name = resolvePodcastBucketName();
  const bucket = getAdminStorageBucket(name);
  if (!bucket) {
    throw new Error('Firebase Admin Storage er ikke konfigureret');
  }
  return bucket;
}

export function incomingAudioPath(slug: string): string {
  return `podcasts/incoming/${slug}/audio.m4a`;
}

export function publishedAudioPath(slug: string): string {
  return `podcasts/articles/${slug}/audio.m4a`;
}

export const MANIFEST_PATH = 'podcasts/manifest.json';
export const FEED_PATH = 'podcasts/feed.xml';
export const SHOW_COVER_PATH = 'podcasts/artwork/show-cover.jpg';
