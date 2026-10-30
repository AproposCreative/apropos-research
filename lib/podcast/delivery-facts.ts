import { getAdminDb } from '@/lib/firebase-admin';
import { getPodcastBucket } from './bucket';
import { podcastMetadataKey } from './feed-metadata-format';
import { selectPodcastRssEpisodes, podcastEpisodeGuid } from './rss-episodes';
import { applyPodcastDeliveryFact, podcastAudioKey, type PodcastDeliveryFact, type PodcastFactMap } from './delivery-format';
import { readMp4Duration } from './mp4-duration';
import { matchSpotifyEpisode, readSpotifyPublicEpisode } from './spotify-evidence';
import type { PodcastManifest, PodcastManifestEpisode } from './types';
import { readPodcastFeedMetadata } from './feed-metadata';
import { applyPodcastFeedMetadata } from './feed-metadata-format';

function database() { const db = getAdminDb(); if (!db) throw Error('podcast_storage_unavailable'); return db; }
const COLLECTION = 'podcastDeliveryFacts';
export async function readPodcastDeliveryFacts(manifest: PodcastManifest): Promise<PodcastFactMap> {
  const db = database(), episodes = selectPodcastRssEpisodes(manifest.episodes); if (!episodes.length) return {};
  const docs = await db.getAll(...episodes.map(ep => db.collection(COLLECTION).doc(podcastMetadataKey(podcastEpisodeGuid(ep)))));
  const facts: PodcastFactMap = {};
  docs.forEach((doc, i) => { const data = doc.data() as PodcastDeliveryFact | undefined;
    if (data && data.guid === podcastEpisodeGuid(episodes[i]) && data.audioKey === podcastAudioKey(episodes[i])) facts[data.guid] = data; });
  return facts;
}
export async function measureExistingEpisodeDuration(ep: PodcastManifestEpisode): Promise<{ durationSeconds: number; audioGeneration: string }> {
  const url = new URL(ep.audioURL), bucket = getPodcastBucket();
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com' || url.username || url.password ||
    !match || decodeURIComponent(match[1]) !== bucket.name) throw Error('podcast_audio_source_invalid');
  const path = decodeURIComponent(match[2]);
  if (!/^podcasts\/(?:narration|articles)\/.+\.m4a$/.test(path) || path.split('/').includes('..')) throw Error('podcast_audio_source_invalid');
  const [meta] = await bucket.file(path).getMetadata(), size = Number(meta.size);
  if (!Number.isSafeInteger(size) || size < 16 || ep.audioBytes && ep.audioBytes !== size) throw Error('podcast_audio_identity_changed');
  const pinned = bucket.file(path, { generation: meta.generation });
  const duration = await readMp4Duration(size, async (start, end) => (await pinned.download({ start, end }))[0]);
  if (!duration) throw Error('podcast_audio_duration_unknown');
  return { durationSeconds: duration, audioGeneration: String(meta.generation) };
}
export async function syncPodcastDurations(manifest: PodcastManifest, limit = 20) {
  const db = database(), facts = await readPodcastDeliveryFacts(manifest), episodes = selectPodcastRssEpisodes(manifest.episodes);
  const pending = episodes.filter(ep => !ep.durationSeconds && !facts[podcastEpisodeGuid(ep)]?.durationSeconds)
    .sort((a, b) => String(facts[podcastEpisodeGuid(a)]?.durationAttemptedAt || '').localeCompare(String(facts[podcastEpisodeGuid(b)]?.durationAttemptedAt || '')));
  const updated: string[] = [], failed: Array<{ guid: string; reason: string }> = [];
  for (const ep of pending.slice(0, Math.min(20, Math.max(1, limit)))) {
    const guid = podcastEpisodeGuid(ep), audioKey = podcastAudioKey(ep), ref = db.collection(COLLECTION).doc(podcastMetadataKey(guid));
    try {
      const measured = await measureExistingEpisodeDuration(ep);
      await db.runTransaction(async tx => {
        const previous = (await tx.get(ref)).data() as PodcastDeliveryFact | undefined;
        tx.set(ref, { ...(previous?.audioKey === audioKey ? previous : {}), guid, audioKey, ...measured,
          durationSource: 'mp4-mvhd', durationCheckedAt: new Date().toISOString(), durationAttemptedAt: new Date().toISOString(), durationFailure: null });
      });
      updated.push(guid);
    } catch {
      await db.runTransaction(async tx => {
        const previous = (await tx.get(ref)).data() as PodcastDeliveryFact | undefined;
        tx.set(ref, { ...(previous?.audioKey === audioKey ? previous : {}), guid, audioKey,
          durationAttemptedAt: new Date().toISOString(), durationFailure: 'duration_unavailable' });
      });
      failed.push({ guid, reason: 'duration_unavailable' });
    }
  }
  return { updated, failed, remaining: pending.length - updated.length };
}
export async function verifySpotifyDelivery(manifest: PodcastManifest, episodeUrl?: string, expectedGuid?: string) {
  const [facts, metadata] = await Promise.all([readPodcastDeliveryFacts(manifest), readPodcastFeedMetadata(manifest)]);
  const evidence = await readSpotifyPublicEpisode(episodeUrl);
  if (!evidence) return { verified: false, reason: 'spotify_unavailable' };
  const ep = matchSpotifyEpisode(evidence, selectPodcastRssEpisodes(manifest.episodes).flatMap(e => {
    const measured = applyPodcastDeliveryFact(e, facts[podcastEpisodeGuid(e)]);
    return [applyPodcastFeedMetadata(measured, metadata[podcastEpisodeGuid(e)]), measured];
  }));
  if (!ep || expectedGuid && podcastEpisodeGuid(ep) !== expectedGuid) return { verified: false, reason: 'spotify_match_not_verified' };
  const guid = podcastEpisodeGuid(ep), audioKey = podcastAudioKey(ep), db = database(), ref = db.collection(COLLECTION).doc(podcastMetadataKey(guid));
  await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data() as PodcastDeliveryFact | undefined;
    tx.set(ref, { ...(old?.audioKey === audioKey ? old : {}), guid, audioKey,
      spotify: { episodeId: evidence.id, url: `https://open.spotify.com/episode/${evidence.id}`, checkedAt: new Date().toISOString(), source: 'spotify-public-embed' } });
  });
  return { verified: true, guid };
}
