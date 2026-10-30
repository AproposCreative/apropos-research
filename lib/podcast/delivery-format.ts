import { createHash } from 'node:crypto';
import type { PodcastManifestEpisode } from './types';
import { podcastEpisodeGuid } from './rss-episodes';

export { PODCAST_SPOTIFY_SHOW_ID, PODCAST_SPOTIFY_SHOW_URL, PODCAST_ISSUE_LABELS } from './delivery-labels';
export type SpotifyEvidence = { episodeId: string; url: string; checkedAt: string; source: 'spotify-public-embed' };
export type PodcastDeliveryFact = {
  guid: string; audioKey: string; durationSeconds?: number; durationCheckedAt?: string;
  audioGeneration?: string; durationSource?: 'mp4-mvhd'; spotify?: SpotifyEvidence;
  durationAttemptedAt?: string; durationFailure?: string | null;
};
export type PodcastFactMap = Record<string, PodcastDeliveryFact>;
export function podcastAudioKey(ep: PodcastManifestEpisode): string {
  return createHash('sha256').update(JSON.stringify([podcastEpisodeGuid(ep), ep.audioURL, ep.audioBytes || 0, ep.publishedAt])).digest('hex');
}
export function applyPodcastDeliveryFact(ep: PodcastManifestEpisode, fact?: PodcastDeliveryFact): PodcastManifestEpisode {
  if (!fact || fact.guid !== podcastEpisodeGuid(ep) || fact.audioKey !== podcastAudioKey(ep)) return ep;
  return !ep.durationSeconds && fact.durationSeconds ? { ...ep, durationSeconds: fact.durationSeconds } : ep;
}
export type PodcastIssue = {
  id: string; scope: string; stage: string; reason: string; fingerprint: string;
  active: boolean; firstSeenAt: string; lastSeenAt: string; acknowledgedFingerprint: string | null;
};
export function podcastIssueId(scope: string, stage: string): string {
  return createHash('sha256').update(JSON.stringify([scope, stage])).digest('hex');
}
export function nextPodcastIssue(previous: PodcastIssue | undefined, input: { scope: string; stage: string; reason: string }, now: string, baseline: boolean): PodcastIssue {
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const sameActive = previous?.active && previous.fingerprint === fingerprint;
  return { ...input, id: podcastIssueId(input.scope, input.stage), fingerprint, active: true,
    firstSeenAt: sameActive ? previous.firstSeenAt : now, lastSeenAt: now,
    acknowledgedFingerprint: baseline ? fingerprint : sameActive ? previous.acknowledgedFingerprint : null };
}
