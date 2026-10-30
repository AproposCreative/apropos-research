import { PODCAST_SPOTIFY_SHOW_ID } from './delivery-format';
import type { PodcastManifestEpisode } from './types';
import { podcastEpisodeGuid } from './rss-episodes';
export type PublicSpotifyEpisode = { id: string; title: string; releasedAt: string; durationSeconds: number; showId: string };
export function parseSpotifyPublicEpisode(html: string): PublicSpotifyEpisode | null {
  const raw = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!raw) return null;
  try {
    const e = JSON.parse(raw).props?.pageProps?.state?.data?.entity;
    if (e?.type !== 'episode' || !/^[a-zA-Z0-9]{22}$/.test(e.id) || typeof e.title !== 'string' ||
      !Number.isFinite(Date.parse(e.releaseDate?.isoString)) || typeof e.duration !== 'number' || e.duration <= 0) return null;
    const showId = String(e.relatedEntityUri || '').match(/^spotify:show:([a-zA-Z0-9]{22})$/)?.[1];
    return showId ? { id: e.id, title: e.title, releasedAt: e.releaseDate.isoString, durationSeconds: Math.round(e.duration / 1000), showId } : null;
  } catch { return null; }
}
export function matchSpotifyEpisode(publicEpisode: PublicSpotifyEpisode, episodes: PodcastManifestEpisode[]): PodcastManifestEpisode | null {
  if (publicEpisode.showId !== PODCAST_SPOTIFY_SHOW_ID) return null;
  const normalized = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const matches = episodes.filter(ep => normalized(ep.title) === normalized(publicEpisode.title) && ep.durationSeconds &&
    Math.abs(ep.durationSeconds - publicEpisode.durationSeconds) <= 2 &&
    Math.abs(Date.parse(ep.publishedAt) - Date.parse(publicEpisode.releasedAt)) <= 120_000);
  // Never assign an external episode by title alone or guess among revisions.
  const guids = new Set(matches.map(podcastEpisodeGuid));
  return guids.size === 1 ? matches[0] : null;
}
export async function readSpotifyPublicEpisode(episodeUrl?: string): Promise<PublicSpotifyEpisode | null> {
  let endpoint = `https://open.spotify.com/embed/show/${PODCAST_SPOTIFY_SHOW_ID}`;
  if (episodeUrl) {
    let url: URL;
    try { url = new URL(episodeUrl); } catch { throw Error('podcast_spotify_url_invalid'); }
    const id = url.pathname.match(/^\/episode\/([a-zA-Z0-9]{22})$/)?.[1];
    if (url.origin !== 'https://open.spotify.com' || url.username || url.password || !id) throw Error('podcast_spotify_url_invalid');
    endpoint = `https://open.spotify.com/embed/episode/${id}`;
  }
  const response = await fetch(endpoint, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'AproposPodcastStatus/1.0', Accept: 'text/html' } });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > 1_500_000) return null;
  const reader = response.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const result = await reader.read(); if (result.done) break; size += result.value.length;
      if (size > 1_500_000) return null; chunks.push(result.value); }
  } finally { await reader.cancel().catch(() => {}); }
  // Select descriptive public fields only. No access tokens, session state,
  // playback URLs or browser cookies are extracted or used.
  return parseSpotifyPublicEpisode(Buffer.concat(chunks).toString('utf8'));
}
