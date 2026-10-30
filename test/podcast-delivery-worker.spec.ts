import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ records: new Map<string, any>(), metadata: vi.fn(), durations: vi.fn(), spotify: vi.fn(), mirror: vi.fn(), persist: vi.fn(), issues: vi.fn(), reconcile: vi.fn(), articles: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: (c: string) => ({ doc: (id: string) => ({ path: `${c}/${id}` }) }),
  runTransaction: async (run: any) => run({ get: async (ref: any) => ({ data: () => mocks.records.get(ref.path) }), set: (ref: any, data: any) => mocks.records.set(ref.path, data), delete: (ref: any) => mocks.records.delete(ref.path) }) }) }));
vi.mock('@/lib/podcast/manifest', () => ({ readPodcastManifest: async () => ({ version: 1, episodes: [] }), writeFeedMirror: mocks.mirror }));
vi.mock('@/lib/podcast/feed-metadata', () => ({ syncPodcastFeedMetadata: mocks.metadata, fetchPublishedPodcastArticles: mocks.articles }));
vi.mock('@/lib/podcast/delivery-facts', () => ({ syncPodcastDurations: mocks.durations, verifySpotifyDelivery: mocks.spotify }));
vi.mock('@/lib/podcast/operations', () => ({ readPodcastIssues: mocks.issues, persistPodcastOperations: mocks.persist, reconcilePodcastIssues: mocks.reconcile }));
import { refreshPodcastFeed } from '../lib/podcast/feed-refresh';
beforeEach(() => {
  vi.resetAllMocks(); mocks.records.clear(); mocks.articles.mockResolvedValue([]); mocks.issues.mockResolvedValue([]);
  mocks.metadata.mockResolvedValue({ busy: false, updated: [], remaining: 0, failed: [] }); mocks.durations.mockResolvedValue({ updated: [], remaining: 0, failed: [] });
  mocks.spotify.mockResolvedValue({ verified: false }); mocks.persist.mockResolvedValue({ summary: { newIssues: 0 } }); mocks.reconcile.mockResolvedValue(undefined);
});
it('uses a durable lease and safely resumes after expiry without duplicate work', async () => {
  mocks.records.set('podcastFeedOperations/delivery-refresh', { until: Date.now() + 10000 });
  expect((await refreshPodcastFeed()).status).toBe(409); expect(mocks.metadata).not.toHaveBeenCalled();
  mocks.records.set('podcastFeedOperations/delivery-refresh', { until: Date.now() - 1 });
  expect((await refreshPodcastFeed()).status).toBe(200); expect(mocks.metadata).toHaveBeenCalledTimes(1); expect(mocks.records.size).toBe(0);
});
it('retains separate stage failures, does not retry automatically and keeps successful duration work', async () => {
  mocks.metadata.mockResolvedValue({ busy: false, updated: [], failed: [{ guid: 'a', reason: 'podcast_artwork_upload_failed' }] });
  mocks.durations.mockResolvedValue({ updated: ['b'], remaining: 0, failed: [] }); mocks.mirror.mockRejectedValue(Error('SECRET'));
  const response = await refreshPodcastFeed(); expect(response.status).toBe(207); const json = await response.json(); expect(json.durationUpdated).toEqual(['b']);
  expect(mocks.metadata).toHaveBeenCalledTimes(1); expect(mocks.persist.mock.calls[0][2]).toContainEqual({ scope: 'feed', stage: 'mirror', reason: 'feed_mirror_failed' });
  expect(JSON.stringify(json)).not.toContain('SECRET');
});
it('records a specific sanitized failure and releases its lease on a service outage', async () => {
  mocks.durations.mockRejectedValue(Error('SECRET')); const response = await refreshPodcastFeed(); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('SECRET'); expect(mocks.reconcile.mock.calls[0][0][0].reason).toBe('duration_sync_failed');
  expect(mocks.records.size).toBe(0);
});
