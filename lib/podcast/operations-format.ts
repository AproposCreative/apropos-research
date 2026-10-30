import type { PodcastManifest } from './types';
import type { PublishedPodcastArticle, PodcastFeedMetadataMap } from './feed-metadata-format';
import { matchPodcastArticle, applyPodcastFeedMetadata } from './feed-metadata-format';
import { selectPodcastRssEpisodes, podcastEpisodeGuid } from './rss-episodes';
import { applyPodcastDeliveryFact, podcastAudioKey, type PodcastFactMap, type PodcastIssue } from './delivery-format';
import { articleUrlFromSlug } from './manifest-format';
import { podcastEpisodeFallbackCoverUrl } from './show-config';

export type PodcastQueueStatus = { slug: string; status: string; at: string | null };
export type PodcastOperationRow = {
  id: string; title: string; articleUrl: string | null; published: boolean; historical: boolean;
  guids: string[]; audio: 'ready' | 'pending' | 'failed' | 'missing'; feed: boolean;
  audioKeys: Record<string, string>;
  durationSeconds: number | null; imageURL: string | null; spotifyUrl: string | null; spotifyCheckedAt: string | null;
  issues: string[]; sortAt: string;
};
export type PodcastOperationsData = {
  generatedAt: string; rows: PodcastOperationRow[]; issues: PodcastIssue[];
  summary: { articles: number; audioReady: number; inFeed: number; missingDuration: number; historical: number; spotifyVerified: number; newIssues: number };
  lastSync: { at: string; status: string } | null; stale?: boolean;
};
export function buildPodcastOperations(input: { manifest: PodcastManifest; articles: PublishedPodcastArticle[];
  metadata: PodcastFeedMetadataMap; facts: PodcastFactMap; queues: PodcastQueueStatus[]; issues?: PodcastIssue[];
  now: string; lastSync?: PodcastOperationsData['lastSync'] }): PodcastOperationsData {
  const episodes = selectPodcastRssEpisodes(input.manifest.episodes), grouped = new Map<string, PodcastOperationRow>();
  for (const original of episodes) {
    const guid = podcastEpisodeGuid(original), metadata = input.metadata[guid];
    const article = matchPodcastArticle(original.articleSlug, input.articles, original.title, metadata?.id);
    const ep = applyPodcastFeedMetadata(applyPodcastDeliveryFact(original, input.facts[guid]), metadata);
    const candidateFact = input.facts[guid];
    const fact = candidateFact?.guid === guid && candidateFact.audioKey === podcastAudioKey(original) ? candidateFact : undefined;
    const id = article ? `article:${article.id}` : `episode:${guid}`;
    const existing = grouped.get(id);
    if (existing) { existing.guids.push(guid); existing.audioKeys[guid] = podcastAudioKey(original); if (!existing.spotifyUrl && fact?.spotify) {
      existing.spotifyUrl = fact.spotify.url; existing.spotifyCheckedAt = fact.spotify.checkedAt; } continue; }
    grouped.set(id, { id, title: article?.title || ep.title, articleUrl: article ? articleUrlFromSlug(article.slug) : null,
      published: Boolean(article), historical: !article, guids: [guid], audio: 'ready', feed: true,
      audioKeys: { [guid]: podcastAudioKey(original) },
      durationSeconds: ep.durationSeconds || null, imageURL: ep.imageURL && !ep.imageURL.endsWith('/podcast/show-cover.jpg') ? ep.imageURL : podcastEpisodeFallbackCoverUrl(),
      spotifyUrl: fact?.spotify?.url || null, spotifyCheckedAt: fact?.spotify?.checkedAt || null,
      issues: [], sortAt: ep.publishedAt });
  }
  for (const article of input.articles) {
    const id = `article:${article.id}`; if (grouped.has(id)) continue;
    const queue = input.queues.filter(q => q.slug === article.slug).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    grouped.set(id, { id, title: article.title, articleUrl: articleUrlFromSlug(article.slug), published: true,
      historical: false, guids: [], audio: queue?.status === 'error' ? 'failed' : queue && queue.status !== 'done' ? 'pending' : 'missing',
      audioKeys: {},
      feed: false, durationSeconds: null, imageURL: article.coverUrl || null, spotifyUrl: null, spotifyCheckedAt: null, issues: [], sortAt: queue?.at || article.lastPublishedAt || '' });
  }
  const issues = input.issues || [];
  for (const row of grouped.values()) row.issues = issues.filter(i => i.active && (row.guids.includes(i.scope) || i.scope === row.id)).map(i => i.id);
  const rows = [...grouped.values()].sort((a, b) => b.sortAt.localeCompare(a.sortAt) || a.title.localeCompare(b.title, 'da'));
  return { generatedAt: input.now, rows, issues, summary: {
    articles: input.articles.length, audioReady: rows.filter(r => r.audio === 'ready').length, inFeed: episodes.length,
    missingDuration: episodes.filter(ep => !applyPodcastDeliveryFact(ep, input.facts[podcastEpisodeGuid(ep)]).durationSeconds).length,
    historical: rows.filter(r => r.historical).length, spotifyVerified: episodes.filter(ep => {
      const fact = input.facts[podcastEpisodeGuid(ep)]; return fact?.audioKey === podcastAudioKey(ep) && Boolean(fact?.spotify);
    }).length,
    newIssues: issues.filter(i => i.active && i.acknowledgedFingerprint !== i.fingerprint).length,
  }, lastSync: input.lastSync || null };
}
export function collectPodcastProblems(input: { manifest: PodcastManifest; articles: PublishedPodcastArticle[]; metadata: PodcastFeedMetadataMap;
  queues: PodcastQueueStatus[]; facts?: PodcastFactMap; now: number }): Array<{ scope: string; stage: string; reason: string }> {
  const episodes = selectPodcastRssEpisodes(input.manifest.episodes), problems: Array<{ scope: string; stage: string; reason: string }> = [];
  const completedSlugs = new Set<string>();
  for (const ep of episodes) {
    const guid = podcastEpisodeGuid(ep), article = matchPodcastArticle(ep.articleSlug, input.articles, ep.title, input.metadata[guid]?.id);
    completedSlugs.add(ep.articleSlug); if (article) completedSlugs.add(article.slug);
    if (!article) problems.push({ scope: guid, stage: 'metadata', reason: 'source_missing' });
    if (!ep.durationSeconds && input.facts?.[guid]?.durationFailure) problems.push({ scope: guid, stage: 'duration', reason: 'duration_unavailable' });
  }
  for (const article of input.articles) {
    if (completedSlugs.has(article.slug)) continue;
    const queue = input.queues.filter(q => q.slug === article.slug).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    if (queue?.status === 'error') problems.push({ scope: `article:${article.id}`, stage: 'audio', reason: 'audio_failed' });
    else if (queue && queue.status !== 'done' && queue.at && input.now - Date.parse(queue.at) > 2 * 3600_000)
      problems.push({ scope: `article:${article.id}`, stage: 'audio', reason: 'audio_stalled' });
  }
  return problems;
}
