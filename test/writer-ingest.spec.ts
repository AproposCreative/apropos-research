import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sources: vi.fn(), feed: vi.fn(), sitemap: vi.fn(), fetch: vi.fn(), parse: vi.fn(), upsert: vi.fn(), prune: vi.fn() }));
vi.mock('@/src/discovery/feeds', () => ({ discoverFromFeed: mocks.feed }));
vi.mock('@/src/discovery/sitemap', () => ({ discoverFromSitemaps: mocks.sitemap }));
vi.mock('@/src/fetch/fetch', () => ({ fetchText: mocks.fetch }));
vi.mock('@/src/parse/article', () => ({ parseArticleHtml: mocks.parse }));
vi.mock('@/lib/getMediaSources', () => ({
  getDefaultMediaSources: () => [{ id: 'soundvenue', name: 'Soundvenue', baseUrl: 'https://soundvenue.com' }],
  getAllEnabledMediaSources: mocks.sources,
}));
vi.mock('@/lib/trending/firestore-store', () => ({ upsertTrendingArticles: mocks.upsert, pruneOldTrendingArticles: mocks.prune }));
import { runIngestToFirestore } from '@/lib/trending/ingest-runner';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.sources.mockResolvedValue([{ id: 'shared_soundvenue', name: 'Soundvenue', baseUrl: 'https://soundvenue.com', sitemapIndex: '/feed', enabled: true }]);
  mocks.feed.mockResolvedValue([{ url: 'https://soundvenue.com/film/a', source: 'soundvenue', published_at: '2026-09-09T10:00:00Z' }]);
  mocks.sitemap.mockResolvedValue([]);
  mocks.fetch.mockResolvedValue({ text: '<article>source</article>', contentType: 'text/html', status: 200 });
  mocks.parse.mockReturnValue({ title: 'Filmartikel', body_text: 'Research '.repeat(20) });
  mocks.upsert.mockResolvedValue({ added: 1, updated: 0, unchanged: 0 });
});
it('uses scoped discovery, stateless fetch and preserves the actual feed publication date', async () => {
  await runIngestToFirestore({ source: 'soundvenue', limit: 20 });
  const sources = [{ id: 'soundvenue', name: 'Soundvenue', baseUrl: 'https://soundvenue.com', sitemapIndex: '/feed', enabled: true }];
  expect(mocks.feed).toHaveBeenCalledWith('soundvenue', sources);
  expect(mocks.sitemap).toHaveBeenCalledWith({ source: 'soundvenue', persistCache: false, sources });
  expect(mocks.fetch).toHaveBeenCalledWith('https://soundvenue.com/film/a', expect.objectContaining({ persistCache: false }));
  expect(mocks.upsert.mock.calls[0][0][0]).toMatchObject({ sourceName: 'Soundvenue', published_at: '2026-09-09T10:00:00Z' });
  expect(mocks.prune).not.toHaveBeenCalled();
});
it('does not fetch candidates outside the configured publishers even with a forged source label', async () => {
  mocks.feed.mockResolvedValue([{ url: 'https://private.example/article', source: 'soundvenue' }]);
  await runIngestToFirestore(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
});
it('propagates shared-source storage failure without falling back to defaults', async () => {
  mocks.sources.mockRejectedValue(new Error('shared_media_sources_unavailable'));
  await expect(runIngestToFirestore()).rejects.toThrow('shared_media_sources_unavailable');
  expect(mocks.feed).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
});
it('does not invent today as publication date when both parser and feed lack a date', async () => {
  mocks.feed.mockResolvedValue([{ url: 'https://soundvenue.com/film/a', source: 'soundvenue' }]);
  await runIngestToFirestore({ source: 'soundvenue', limit: 20 });
  expect(mocks.upsert.mock.calls[0][0][0].published_at).toBeUndefined();
});
it('does not archive HTTP error pages as source articles', async () => {
  mocks.fetch.mockResolvedValue({ text: '<article>Error page</article>', contentType: 'text/html', status: 404 });
  const metrics = await runIngestToFirestore({ source: 'soundvenue', limit: 20 });
  expect(metrics.fetched_fail).toBe(1);
  expect(mocks.parse).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});
