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
import { readPodcastFeedMetadata } from './feed-metadata';
import { readPodcastDeliveryFacts } from './delivery-facts';

const DEFAULT_MANIFEST_TOKEN = '2e7823c1-fc8f-4a77-bfe2-667acbb3ad40';

function emptyManifest(): PodcastManifest {
  return { version: 1, updatedAt: new Date().toISOString(), episodes: [] };
}

async function readManifestForWrite() {
  const file = getPodcastBucket().file(MANIFEST_PATH);
  let prior;
  try {
    [prior] = await file.getMetadata();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
      return {
        file, manifest: emptyManifest(), generation: 0, metageneration: undefined,
        metadata: {
          contentType: 'application/json', cacheControl: 'public, max-age=300',
          metadata: { firebaseStorageDownloadTokens: process.env.PODCAST_MANIFEST_TOKEN?.trim() || DEFAULT_MANIFEST_TOKEN },
        },
      };
    }
    throw error;
  }
  if (!prior || typeof prior !== 'object' || Array.isArray(prior)) throw new Error('Invalid catalog metadata');
  // The SDK transparently decompresses downloads. Do not save plain JSON with
  // a retained compressed-content header unless that encoding is supported.
  if (prior.contentEncoding !== undefined && prior.contentEncoding !== 'identity') {
    throw new Error('Unsupported catalog content encoding');
  }
  const generation = String(prior.generation || ''), metageneration = String(prior.metageneration || '');
  if (!/^[1-9]\d*$/.test(generation) || !/^[1-9]\d*$/.test(metageneration) ||
      (prior.temporaryHold !== undefined && prior.temporaryHold !== false) ||
      (prior.eventBasedHold !== undefined && prior.eventBasedHold !== false) ||
      Object.keys(prior).some(key => /retention/i.test(key) && Reflect.get(prior, key) != null)) {
    throw new Error('Unsupported catalog metadata policy');
  }
  const custom = { ...(prior.metadata || {}) };
  const tokens = custom.firebaseStorageDownloadTokens;
  if (typeof tokens !== 'string' || !tokens.trim()) {
    custom.firebaseStorageDownloadTokens = process.env.PODCAST_MANIFEST_TOKEN?.trim() || DEFAULT_MANIFEST_TOKEN;
  }
  const metadata = {
    contentType: prior.contentType, cacheControl: prior.cacheControl,
    contentDisposition: prior.contentDisposition, contentEncoding: prior.contentEncoding,
    contentLanguage: prior.contentLanguage, customTime: prior.customTime,
    temporaryHold: prior.temporaryHold, eventBasedHold: prior.eventBasedHold,
    metadata: custom,
  };
  // Capture metadata first. If bytes advance while this read is in flight, the
  // captured generation still rejects publication rather than blessing G2 as G1.
  const manifest = await readManifest();
  return { file, manifest, generation, metageneration, metadata };
}

export async function readPodcastManifest(): Promise<PodcastManifest> {
  return readManifest();
}

/** Readers and writers both require the complete existing catalog. A parse or
 * source-proof failure must reach the RSS route's 503 handler, not an empty 200. */
async function readManifest(): Promise<PodcastManifest> {
  const bucket = getPodcastBucket();
  const file = bucket.file(MANIFEST_PATH);
  const [exists] = await file.exists();
  if (!exists) throw new Error('Podcast catalog unavailable');

  const [buf] = await file.download();
  const parsed = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.episodes)) {
    throw new Error('Invalid podcast manifest catalog');
  }
  const episodes = parsed.episodes.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid podcast manifest episode');
    // Reading an old episode must never assign today's date to it.
    if (typeof raw.publishedAt !== 'string' || !Number.isFinite(Date.parse(raw.publishedAt))) {
      throw new Error('Invalid existing podcast publication date');
    }
    const episode = normalizeManifestEpisode(raw as Record<string, unknown>);
    if (!episode) throw new Error('Invalid podcast manifest episode');
    return episode;
  });

  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    updatedAt: String(parsed.updatedAt || new Date().toISOString()),
    episodes,
  };
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

async function saveManifest(
  manifest: PodcastManifest,
  snapshot: Awaited<ReturnType<typeof readManifestForWrite>>
): Promise<void> {

  const payload = {
    version: manifest.version,
    updatedAt: manifest.updatedAt,
    episodes: manifest.episodes.map(({ articleUrl: _a, ...ep }) => ep),
  };

  await snapshot.file.save(JSON.stringify(payload, null, 2), {
    resumable: false,
    preconditionOpts: {
      ifGenerationMatch: snapshot.generation,
      ...(snapshot.metageneration !== undefined ? { ifMetagenerationMatch: snapshot.metageneration } : {}),
    },
    metadata: snapshot.metadata,
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
    metadata: await readPodcastFeedMetadata(manifest),
    facts: await readPodcastDeliveryFacts(manifest),
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
  articleId?: string;
  sourceContentRevision?: string;
}): Promise<PodcastManifest> {
  const snapshot = await readManifestForWrite();
  const manifest = snapshot.manifest;
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
    articleId: input.articleId,
    sourceContentRevision: input.sourceContentRevision,
  });

  const next = manifest.episodes.filter((e) => e.articleSlug !== input.slug);
  next.push(entry);
  manifest.episodes = sortEpisodesDesc(next);
  manifest.updatedAt = new Date().toISOString();

  await saveManifest(manifest, snapshot);
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
