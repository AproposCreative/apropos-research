import { randomUUID } from 'crypto';
import {
  FEED_PATH,
  MANIFEST_PATH,
  getPodcastBucket,
  publishedAudioPath,
  resolvePodcastBucketName,
} from '@/lib/podcast/bucket';
import {
  buildManifestEpisode,
  normalizeManifestEpisode,
} from '@/lib/podcast/manifest-format';
import { buildPodcastRssXml } from '@/lib/podcast/rss';
import { podcastRssFeedUrl, podcastShowCoverUrl } from '@/lib/podcast/show-config';
import type { PodcastManifest, PodcastManifestEpisode } from '@/lib/podcast/types';

const DEFAULT_MANIFEST_TOKEN = '2e7823c1-fc8f-4a77-bfe2-667acbb3ad40';

function emptyManifest(): PodcastManifest {
  return { version: 1, updatedAt: new Date().toISOString(), episodes: [] };
}

async function readManifestDownloadToken(
  file: ReturnType<ReturnType<typeof getPodcastBucket>['file']>
): Promise<string> {
  try {
    const [meta] = await file.getMetadata();
    const raw = meta?.metadata?.firebaseStorageDownloadTokens;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.split(',')[0]!.trim();
    }
  } catch {
    /* ignore */
  }
  return process.env.PODCAST_MANIFEST_TOKEN?.trim() || DEFAULT_MANIFEST_TOKEN;
}

export async function readPodcastManifest(): Promise<PodcastManifest> {
  const bucket = getPodcastBucket();
  const file = bucket.file(MANIFEST_PATH);
  const [exists] = await file.exists();
  if (!exists) return emptyManifest();

  const [buf] = await file.download();
  try {
    const parsed = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
    const rawEpisodes = Array.isArray(parsed.episodes) ? parsed.episodes : [];
    const episodes = rawEpisodes
      .map((e) => normalizeManifestEpisode(e as Record<string, unknown>))
      .filter((e): e is PodcastManifestEpisode => e !== null);

    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      episodes,
    };
  } catch {
    return emptyManifest();
  }
}

export function sortEpisodesDesc(episodes: PodcastManifestEpisode[]): PodcastManifestEpisode[] {
  return [...episodes].sort(
    (a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '')
  );
}

export async function listRecentEpisodes(limit = 5): Promise<PodcastManifestEpisode[]> {
  const manifest = await readPodcastManifest();
  return sortEpisodesDesc(manifest.episodes).slice(0, Math.max(1, limit));
}

export function buildPublicAudioUrl(slug: string, downloadToken: string): string {
  const bucket = resolvePodcastBucketName();
  const path = publishedAudioPath(slug);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
}

async function saveManifest(manifest: PodcastManifest): Promise<void> {
  const bucket = getPodcastBucket();
  const file = bucket.file(MANIFEST_PATH);
  const token = await readManifestDownloadToken(file);

  const payload = {
    version: manifest.version,
    updatedAt: manifest.updatedAt,
    episodes: manifest.episodes.map(({ articleUrl: _a, ...ep }) => ep),
  };

  await file.save(JSON.stringify(payload, null, 2), {
    resumable: false,
    metadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=300',
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  await writeFeedMirror(manifest).catch((err) => {
    console.warn('[podcast] feed mirror write failed', err);
  });
}

/** Spejl RSS til Firebase Storage (CDN-backup). Dynamisk /api/podcast/rss er source of truth. */
export async function writeFeedMirror(manifest: PodcastManifest): Promise<void> {
  const bucket = getPodcastBucket();
  const file = bucket.file(FEED_PATH);
  let token = '';
  try {
    const [meta] = await file.getMetadata();
    const raw = meta?.metadata?.firebaseStorageDownloadTokens;
    if (typeof raw === 'string' && raw.trim()) token = raw.split(',')[0]!.trim();
  } catch {
    /* ignore */
  }
  if (!token) token = randomUUID();

  const xml = buildPodcastRssXml({
    manifest,
    feedUrl: podcastRssFeedUrl(),
    showCoverUrl: podcastShowCoverUrl(),
  });

  await file.save(xml, {
    resumable: false,
    metadata: {
      contentType: 'application/rss+xml; charset=utf-8',
      cacheControl: 'public, max-age=300',
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });
}

export async function upsertManifestEpisode(input: {
  slug: string;
  title: string;
  articleUrl: string;
  audioUrl: string;
  hosts?: string[];
  publishedAt?: string;
  durationSeconds?: number;
  audioBytes?: number;
  description?: string | null;
  imageURL?: string | null;
  kind?: 'ai' | 'human';
  guid?: string;
}): Promise<PodcastManifest> {
  const manifest = await readPodcastManifest();
  const entry = buildManifestEpisode({
    slug: input.slug,
    title: input.title,
    audioURL: input.audioUrl,
    hosts: input.hosts,
    publishedAt: input.publishedAt,
    durationSeconds: input.durationSeconds,
    audioBytes: input.audioBytes,
    description: input.description,
    imageURL: input.imageURL,
    kind: input.kind,
    guid: input.guid,
  });

  const next = manifest.episodes.filter((e) => e.articleSlug !== input.slug);
  next.push(entry);
  manifest.episodes = sortEpisodesDesc(next);
  manifest.updatedAt = new Date().toISOString();

  await saveManifest(manifest);
  return manifest;
}

export async function uploadEncodedAudio(
  slug: string,
  content: Buffer,
  contentType = 'audio/mp4'
): Promise<string> {
  const bucket = getPodcastBucket();
  const path = publishedAudioPath(slug);
  const downloadToken = randomUUID();

  await bucket.file(path).save(content, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  return buildPublicAudioUrl(slug, downloadToken);
}
