import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { podcastAudioKey } from '../lib/podcast/delivery-format';
const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), ack: vi.fn(), persist: vi.fn(), refresh: vi.fn(), manifest: vi.fn(), mirror: vi.fn(), articles: vi.fn(), metadata: vi.fn(), durations: vi.fn(), spotify: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access }));
vi.mock('@/lib/podcast/operations', () => ({ readPodcastOperations: mocks.read, acknowledgePodcastIssue: mocks.ack, persistPodcastOperations: mocks.persist }));
vi.mock('@/lib/podcast/feed-refresh', () => ({ refreshPodcastFeed: mocks.refresh }));
vi.mock('@/lib/podcast/manifest', () => ({ readPodcastManifest: mocks.manifest, writeFeedMirror: mocks.mirror }));
vi.mock('@/lib/podcast/feed-metadata', () => ({ fetchPublishedPodcastArticles: mocks.articles, syncPodcastFeedMetadata: mocks.metadata }));
vi.mock('@/lib/podcast/delivery-facts', () => ({ syncPodcastDurations: mocks.durations, verifySpotifyDelivery: mocks.spotify }));
import { GET, POST } from '../app/api/podcast/operations/route';
const ep = { id: 'a', guid: 'a', articleSlug: 'boganmeldelse', title: 'Boganmeldelse', hosts: [], audioURL: 'https://example.test/a.m4a', publishedAt: '2026-10-01T10:00:00Z' };
const request = (body?: unknown) => new NextRequest('https://example.test/api/podcast/operations', body ? { method: 'POST', body: JSON.stringify(body) } : {});
beforeEach(() => {
  vi.resetAllMocks(); mocks.access.mockResolvedValue({ owner: true }); mocks.manifest.mockResolvedValue({ version: 1, episodes: [ep] });
  mocks.articles.mockResolvedValue([]); mocks.metadata.mockResolvedValue({ updated: ['a'], failed: [], remaining: 0 });
  mocks.durations.mockResolvedValue({ updated: ['a'], failed: [], remaining: 0 });
});
it('protects status and all repair mutations with verified current owner access', async () => {
  mocks.access.mockResolvedValue(null); expect((await GET(request())).status).toBe(401); expect((await POST(request({ action: 'refresh' }))).status).toBe(401);
  mocks.access.mockResolvedValue({ owner: false }); expect((await GET(request())).status).toBe(403); expect((await POST(request({ action: 'refresh' }))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
});
it('returns private status and rejects source audio changes, unknown actions and malformed input', async () => {
  mocks.read.mockResolvedValue({ rows: [] }); const response = await GET(request()); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect((await POST(request({ action: 'generate_audio' }))).status).toBe(400);
  expect((await POST(request({ action: 'repair_metadata', guid: 'a', audioKey: 'stale' }))).status).toBe(409);
  expect(mocks.metadata).not.toHaveBeenCalled(); expect(mocks.durations).not.toHaveBeenCalled();
});
it.each(['repair_metadata', 'repair_duration'])('repairs only the requested immutable episode: %s', async action => {
  const response = await POST(request({ action, guid: 'a', audioKey: podcastAudioKey(ep) })); expect(response.status).toBe(200);
  expect((await response.json()).audioRegenerated).toBe(false); expect(mocks.mirror).toHaveBeenCalledTimes(1);
  const called = action === 'repair_metadata' ? mocks.metadata : mocks.durations;
  expect(called.mock.calls[0][0].episodes).toEqual([ep]); expect(called.mock.calls[0][1]).toBe(1);
  expect(action === 'repair_metadata' ? mocks.durations : mocks.metadata).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
});
it('keeps an archive failure separate, resumable and free of internal error data', async () => {
  mocks.metadata.mockResolvedValue({ updated: [], failed: [{ guid: 'a', reason: 'podcast_artwork_readback_failed' }] });
  expect((await POST(request({ action: 'repair_metadata', guid: 'a', audioKey: podcastAudioKey(ep) }))).status).toBe(207);
  mocks.metadata.mockRejectedValue(Error('SECRET stack and credential')); const response = await POST(request({ action: 'repair_metadata', guid: 'a', audioKey: podcastAudioKey(ep) }));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('SECRET'); expect(mocks.refresh).not.toHaveBeenCalled();
});
it('only exposes a Spotify link after verification, and never fetches an arbitrary supplied host', async () => {
  mocks.spotify.mockResolvedValue({ verified: false, reason: 'spotify_match_not_verified' });
  expect((await POST(request({ action: 'verify_spotify', guid: 'a', audioKey: podcastAudioKey(ep) }))).status).toBe(422);
  mocks.spotify.mockRejectedValue(Error('podcast_spotify_url_invalid'));
  expect((await POST(request({ action: 'verify_spotify', guid: 'a', audioKey: podcastAudioKey(ep), spotifyUrl: 'http://private.test' }))).status).toBe(400);
});
