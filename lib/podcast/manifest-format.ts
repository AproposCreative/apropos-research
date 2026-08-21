import type { PodcastManifestEpisode } from '@/lib/podcast/types';
import { podcastShowCoverUrl } from '@/lib/podcast/show-config';

/** iOS PodcastManifestEntry — matcher PodcastManifest.swift */
export function slugToManifestId(slug: string): string {
  const compact = slug.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return compact || slug;
}

export function articleUrlFromSlug(slug: string): string {
  const base = (process.env.NEWSLETTER_ARTICLE_BASE_URL || 'https://www.aproposmagazine.com').replace(
    /\/$/,
    ''
  );
  return `${base}/articles/${slug}`;
}

function optionalPositiveInt(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return undefined;
}

function optionalString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  return t || undefined;
}

/** Normaliser legacy/web entries til iOS-format (+ valgfri RSS-felter). */
export function normalizeManifestEpisode(raw: Record<string, unknown>): PodcastManifestEpisode | null {
  const articleSlug = String(raw.articleSlug || raw.slug || '').trim();
  const title = String(raw.title || '').trim();
  const audioURL = String(raw.audioURL || raw.audioUrl || '').trim();
  if (!articleSlug || !title || !audioURL) return null;

  const publishedAt = String(raw.publishedAt || new Date().toISOString());
  const hostsRaw = raw.hosts;
  const hosts = Array.isArray(hostsRaw)
    ? hostsRaw.map((h) => String(h).trim()).filter(Boolean)
    : ['Apropos Magazine'];

  const id = String(raw.id || slugToManifestId(articleSlug));
  const kindRaw = optionalString(raw.kind);
  const kind = kindRaw === 'ai' || kindRaw === 'human' ? kindRaw : undefined;

  const episode: PodcastManifestEpisode = {
    id,
    articleSlug,
    title,
    subtitle: String(raw.subtitle || 'Lyt til artiklen'),
    audioURL,
    hosts: hosts.length ? hosts : ['Apropos Magazine'],
    publishedAt,
    articleUrl: String(raw.articleUrl || articleUrlFromSlug(articleSlug)),
  };

  const durationSeconds = optionalPositiveInt(raw.durationSeconds);
  if (durationSeconds != null) episode.durationSeconds = durationSeconds;

  const audioBytes = optionalPositiveInt(raw.audioBytes);
  if (audioBytes != null) episode.audioBytes = audioBytes;

  const description = optionalString(raw.description);
  if (description) episode.description = description;

  const imageURL = optionalString(raw.imageURL) || optionalString(raw.imageUrl);
  if (imageURL) episode.imageURL = imageURL;

  const guid = optionalString(raw.guid) || id;
  episode.guid = guid;

  if (kind) episode.kind = kind;

  return episode;
}

export function buildManifestEpisode(input: {
  slug: string;
  title: string;
  audioURL: string;
  hosts?: string[];
  publishedAt?: string;
  durationSeconds?: number;
  audioBytes?: number;
  description?: string | null;
  imageURL?: string | null;
  kind?: 'ai' | 'human';
  guid?: string;
}): PodcastManifestEpisode {
  const publishedAt = input.publishedAt || new Date().toISOString();
  const hosts = input.hosts?.filter(Boolean).length ? input.hosts! : ['Apropos Magazine'];
  const id = slugToManifestId(input.slug);

  const episode: PodcastManifestEpisode = {
    id,
    articleSlug: input.slug,
    title: input.title,
    subtitle: 'Lyt til artiklen',
    audioURL: input.audioURL,
    hosts,
    publishedAt,
    articleUrl: articleUrlFromSlug(input.slug),
    guid: input.guid || id,
  };

  if (typeof input.durationSeconds === 'number' && input.durationSeconds > 0) {
    episode.durationSeconds = Math.round(input.durationSeconds);
  }
  if (typeof input.audioBytes === 'number' && input.audioBytes > 0) {
    episode.audioBytes = Math.round(input.audioBytes);
  }
  if (input.description?.trim()) {
    episode.description = input.description.trim().slice(0, 4000);
  }
  if (input.imageURL?.trim()) {
    episode.imageURL = input.imageURL.trim();
  } else {
    episode.imageURL = podcastShowCoverUrl();
  }
  if (input.kind) episode.kind = input.kind;

  return episode;
}
