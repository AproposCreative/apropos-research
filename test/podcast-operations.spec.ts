import { expect, it } from 'vitest';
import { buildPodcastOperations, collectPodcastProblems } from '../lib/podcast/operations-format';
import { podcastAudioKey } from '../lib/podcast/delivery-format';
import type { PodcastManifestEpisode } from '../lib/podcast/types';
const ep: PodcastManifestEpisode = { id: 'a', guid: 'a', articleSlug: 'en-anmeldelse', title: 'En anmeldelse', subtitle: '',
  audioURL: 'https://example.test/a.m4a', publishedAt: '2026-10-28T15:28:40Z', hosts: ['Frederik'], durationSeconds: 426 };
const article = { id: 'cms', slug: ep.articleSlug, title: ep.title, description: '', coverUrl: 'https://example.test/art.jpg', credit: '' };
const input = { manifest: { version: 1, updatedAt: ep.publishedAt, episodes: [ep] }, articles: [article], metadata: {}, facts: {},
  queues: [{ slug: ep.articleSlug, status: 'error', at: '2026-10-28T10:00:00Z' }], now: '2026-10-30T12:00:00Z' };
it('keeps published, audio, feed and verified Spotify status separate and does not let a historical queue error override ready audio', () => {
  const data = buildPodcastOperations(input), row = data.rows[0];
  expect(row).toMatchObject({ published: true, audio: 'ready', feed: true, spotifyUrl: null, historical: false });
  expect(collectPodcastProblems({ ...input, now: Date.now() })).toEqual([]);
});
it('groups retained revisions in the overview without deleting or merging their RSS identities', () => {
  const m = { ...input.manifest, episodes: [ep, { ...ep, id: 'b', guid: 'b', publishedAt: '2026-10-28T15:00:00Z' }] };
  const data = buildPodcastOperations({ ...input, manifest: m });
  expect(data.rows).toHaveLength(1); expect(data.rows[0].guids).toEqual(['a', 'b']);
  expect(data.summary.inFeed).toBe(2); expect(m.episodes).toHaveLength(2);
});
it('shows an actual checked Spotify link with its dated evidence', () => {
  const facts = { a: { guid: 'a', audioKey: podcastAudioKey(ep), spotify: { episodeId: '0UxG5lNMhor1j0ElNdjrER', url: 'https://open.spotify.com/episode/0UxG5lNMhor1j0ElNdjrER', checkedAt: '2026-10-30T12:00:00Z', source: 'spotify-public-embed' as const } } };
  const data = buildPodcastOperations({ ...input, facts });
  expect(data.summary.spotifyVerified).toBe(1); expect(data.rows[0].spotifyCheckedAt).toBe(facts.a.spotify.checkedAt);
});
it('invalidates a Spotify receipt after the original audio identity changes', () => {
  const facts = { a: { guid: 'a', audioKey: 'stale', spotify: { episodeId: '0UxG5lNMhor1j0ElNdjrER', url: 'https://open.spotify.com/episode/0UxG5lNMhor1j0ElNdjrER', checkedAt: '2026-10-30T12:00:00Z', source: 'spotify-public-embed' as const } } };
  const data = buildPodcastOperations({ ...input, facts }); expect(data.summary.spotifyVerified).toBe(0); expect(data.rows[0].spotifyUrl).toBeNull();
});
it('retains missing-source historical audio with no broken article link or fabricated publication', () => {
  const data = buildPodcastOperations({ ...input, articles: [] });
  expect(data.rows[0]).toMatchObject({ published: false, historical: true, audio: 'ready', feed: true, articleUrl: null });
  expect(collectPodcastProblems({ ...input, articles: [], now: Date.now() })).toEqual([{ scope: 'a', stage: 'metadata', reason: 'source_missing' }]);
});
it('includes published articles whose audio is missing, pending or stopped', () => {
  const data = buildPodcastOperations({ ...input, manifest: { ...input.manifest, episodes: [] } });
  expect(data.rows[0]).toMatchObject({ published: true, audio: 'failed', feed: false });
  expect(collectPodcastProblems({ ...input, manifest: { ...input.manifest, episodes: [] }, now: Date.now() })).toEqual([{ scope: 'article:cms', stage: 'audio', reason: 'audio_failed' }]);
});
