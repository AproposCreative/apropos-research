import type { PodcastManifestEpisode } from '@/lib/podcast/types';

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

/** Normaliser legacy/web entries til iOS-format. */
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

  return {
    id: String(raw.id || slugToManifestId(articleSlug)),
    articleSlug,
    title,
    subtitle: String(raw.subtitle || 'Lyt til artiklen'),
    audioURL,
    hosts: hosts.length ? hosts : ['Apropos Magazine'],
    publishedAt,
    articleUrl: String(raw.articleUrl || articleUrlFromSlug(articleSlug)),
  };
}

export function buildManifestEpisode(input: {
  slug: string;
  title: string;
  audioURL: string;
  hosts?: string[];
  publishedAt?: string;
}): PodcastManifestEpisode {
  const publishedAt = input.publishedAt || new Date().toISOString();
  const hosts = input.hosts?.filter(Boolean).length ? input.hosts! : ['Apropos Magazine'];

  return {
    id: slugToManifestId(input.slug),
    articleSlug: input.slug,
    title: input.title,
    subtitle: 'Lyt til artiklen',
    audioURL: input.audioURL,
    hosts,
    publishedAt,
    articleUrl: articleUrlFromSlug(input.slug),
  };
}
