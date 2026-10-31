import { createHash } from 'node:crypto';
import { articleUrlFromSlug, slugToManifestId } from './manifest-format';
import { podcastEpisodeGuid } from './rss-episodes';
import type { PodcastManifestEpisode } from './types';
import { PODCAST_ARTWORK_STYLE } from './artwork-style';

export type PublishedPodcastArticle = {
  id: string; slug: string; title: string; description: string; coverUrl: string; credit: string;
  lastPublishedAt?: string;
};
export type PodcastFeedMetadata = PublishedPodcastArticle & {
  guid: string; articleIdentity: string; sourceHash: string; imageURL: string;
  artworkSha256: string; artworkBytes: number; updatedAt: string;
  artworkStyle?: string;
  identitySource?: 'narration_queue'; sourceQueueId?: string;
};
export type PodcastFeedMetadataMap = Record<string, PodcastFeedMetadata>;

export function podcastMetadataKey(guid: string): string {
  return createHash('sha256').update(guid).digest('hex');
}

/** CMS copy only: no model, invented summary or draft content. */
export function podcastPlainText(value: unknown, limit = 600): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(x[\da-f]+|\d+);/gi, (match, code: string) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }).replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).replace(/\s+\S*$/, '').trim() + '…';
}

export function publishedPodcastArticle(item: Record<string, unknown>): PublishedPodcastArticle | null {
  // Caller must use Webflow's /items/live endpoint. Never derive from staged items.
  if (item.isArchived === true || item.isDraft === true) return null;
  const fields = item.fieldData as Record<string, unknown> | undefined;
  if (!fields || typeof fields.slug !== 'string' || typeof fields.name !== 'string' || typeof item.id !== 'string' || !item.id.trim()) return null;
  // Same preference as PodcastRepository.enriched in the app: mobile first.
  const coverUrl = ['mobile-image', 'thumb'].map(key => {
    const image = fields[key] as { url?: unknown } | string | undefined;
    return typeof image === 'string' ? image.trim() : typeof image?.url === 'string' ? image.url.trim() : '';
  }).find(url => /^https:\/\//i.test(url)) || '';
  const slug = fields.slug.trim(), title = podcastPlainText(fields.name, 500);
  if (!slug || !title) return null;
  const description = ['meta-description', 'intro', 'subtitle', 'summary', 'excerpt']
    .map(key => podcastPlainText(fields[key])).find(Boolean) || '';
  return { id: String(item.id || ''), slug, title, description, coverUrl: coverUrl.trim(), credit: podcastPlainText(fields['foto-credit'], 300),
    ...(typeof item.lastPublished === 'string' && Number.isFinite(Date.parse(item.lastPublished)) ? { lastPublishedAt: item.lastPublished } : {}) };
}

export function matchPodcastArticle(slug: string, articles: PublishedPodcastArticle[], originalTitle?: string, boundCmsId?: string): PublishedPodcastArticle | null {
  // Retain an established CMS identity across later title/slug changes.
  if (boundCmsId) {
    const bound = articles.filter(a => a.id === boundCmsId);
    if (bound.length === 1) return bound[0];
    return null;
  }
  const exact = articles.filter(a => a.slug === slug);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const matches = articles.filter(a => slugToManifestId(a.slug) === slugToManifestId(slug));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1 || !originalTitle) return null;
  // Legacy narration sometimes stored an English slug for a Danish article.
  // Bootstrap only on a unique, EXACT complete title; never fuzzy similarity.
  const title = podcastPlainText(originalTitle, 500).normalize('NFC');
  const byTitle = articles.filter(a => a.title.normalize('NFC') === title);
  return byTitle.length === 1 ? byTitle[0] : null;
}

export function podcastSourceHash(article: PublishedPodcastArticle): string {
  const { id, slug, title, description, coverUrl, credit } = article;
  return podcastMetadataKey(JSON.stringify({ version: 2, artworkStyle: PODCAST_ARTWORK_STYLE, id, slug, title, description, coverUrl, credit }));
}

/** Presentation only. GUID, locale selection, audio, author and original dates cannot change. */
export function applyPodcastFeedMetadata(episode: PodcastManifestEpisode, metadata?: PodcastFeedMetadata): PodcastManifestEpisode {
  if (!metadata || metadata.guid !== podcastEpisodeGuid(episode) ||
      metadata.articleIdentity !== slugToManifestId(episode.articleSlug)) return episode;
  return { ...episode, title: metadata.title, description: metadata.description || episode.description,
    articleUrl: articleUrlFromSlug(metadata.slug), imageURL: metadata.imageURL };
}

/** The raw audio manifest can arrive before the artwork worker. Do not announce
 * that new episode to RSS readers with a temporary cover they may cache. */
export function hasReadyPodcastArtwork(episode: PodcastManifestEpisode, metadata?: PodcastFeedMetadata): boolean {
  return Boolean(metadata && metadata.guid === podcastEpisodeGuid(episode) &&
    metadata.articleIdentity === slugToManifestId(episode.articleSlug) &&
    metadata.artworkStyle === PODCAST_ARTWORK_STYLE &&
    /^https:\/\//i.test(metadata.imageURL) && /^[a-f0-9]{64}$/.test(metadata.artworkSha256) &&
    Number.isFinite(metadata.artworkBytes) && metadata.artworkBytes > 0);
}
