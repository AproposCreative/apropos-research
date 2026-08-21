import { listRecentEpisodes, readPodcastManifest } from '@/lib/podcast/manifest';
import { normalizeArticleUrl } from '@/lib/podcast/slug-from-url';
import type { PodcastManifestEpisode } from '@/lib/podcast/types';

export type PublicPodcastEpisode = {
  id: string;
  articleSlug: string;
  title: string;
  subtitle: string;
  audioURL: string;
  hosts: string[];
  publishedAt: string;
  articleUrl: string;
  /** Article/show cover when present on the manifest entry. */
  artworkURL?: string;
};

export function toPublicEpisode(ep: PodcastManifestEpisode): PublicPodcastEpisode {
  const artworkURL = typeof ep.imageURL === 'string' && ep.imageURL.trim() ? ep.imageURL.trim() : undefined;
  return {
    id: ep.id,
    articleSlug: ep.articleSlug,
    title: ep.title,
    subtitle: ep.subtitle,
    audioURL: ep.audioURL,
    hosts: ep.hosts,
    publishedAt: ep.publishedAt,
    articleUrl: ep.articleUrl || normalizeArticleUrl(ep.articleSlug),
    ...(artworkURL ? { artworkURL } : {}),
  };
}

export async function findPublicEpisodeBySlug(
  slug: string
): Promise<PublicPodcastEpisode | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const manifest = await readPodcastManifest();
  const match = manifest.episodes.find((e) => e.articleSlug === trimmed);
  return match ? toPublicEpisode(match) : null;
}

export async function listPublicEpisodes(limit = 20): Promise<PublicPodcastEpisode[]> {
  const capped = Math.min(50, Math.max(1, limit));
  const episodes = await listRecentEpisodes(capped);
  return episodes.map(toPublicEpisode);
}
