import type { PodcastManifestEpisode } from './types';
import { isEnglishPodcastEpisode } from './episode-locale';
import { slugToManifestId } from './manifest-format';

export function podcastEpisodeGuid(episode: PodcastManifestEpisode): string {
  return episode.guid?.trim() || episode.id?.trim() || episode.articleSlug.trim();
}

/** RSS identifies episodes by GUID. Legacy slug punctuation changes can leave
 * two revisions of the same article under that identity. Publish the preferred
 * revision once without deleting either original from the shared app catalog. */
export function selectPodcastRssEpisodes(
  episodes: readonly PodcastManifestEpisode[]
): PodcastManifestEpisode[] {
  const byGuid = new Map<string, PodcastManifestEpisode>();
  for (const episode of episodes) {
    if (isEnglishPodcastEpisode(episode)) continue;
    const guid = podcastEpisodeGuid(episode);
    const previous = byGuid.get(guid);
    if (!previous) {
      byGuid.set(guid, episode);
      continue;
    }
    if (slugToManifestId(previous.articleSlug) !== slugToManifestId(episode.articleSlug)) {
      throw new Error(
        'Podcast-feedet har samme episode-ID på forskellige artikler. Identiteterne skal afklares.'
      );
    }
    const human = episode.kind === 'human';
    const previousHuman = previous.kind === 'human';
    const newer = Date.parse(episode.publishedAt) > Date.parse(previous.publishedAt);
    if ((human && !previousHuman) || (human === previousHuman && newer)) byGuid.set(guid, episode);
  }
  return [...byGuid.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
