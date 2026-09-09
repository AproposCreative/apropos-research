import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ feed: vi.fn(), sitemap: vi.fn(), fetch: vi.fn(), parse: vi.fn(), upsert: vi.fn(), prune: vi.fn() }));
vi.mock('@/src/discovery/feeds', () => ({ discoverFromFeed: mocks.feed }));
vi.mock('@/src/discovery/sitemap', () => ({ discoverFromSitemaps: mocks.sitemap }));
vi.mock('@/src/fetch/fetch', () => ({ fetchText: mocks.fetch }));
vi.mock('@/src/parse/article', () => ({ parseArticleHtml: mocks.parse }));
vi.mock('@/lib/getMediaSources', () => ({
  getDefaultMediaSources: () => [{ id: 'soundvenue', name: 'Soundvenue', baseUrl: 'https://soundvenue.com' }],
  getAllEnabledMediaSources: async () => [{ id: 'USER_soundvenue', name: 'Soundvenue', baseUrl: 'https://soundvenue.com' }],
}));
vi.mock('@/lib/trending/firestore-store', () => ({ upsertTrendingArticles: mocks.upsert, pruneOldTrendingArticles: mocks.prune }));
import { runIngestToFirestore } from '@/lib/trending/ingest-runner';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.feed.mockResolvedValue([{ url: 'https://soundvenue.com/film/a', source: 'soundvenue', published_at: '2026-09-09T10:00:00Z' }]);
  mocks.sitemap.mockResolvedValue([]);
  mocks.fetch.mockResolvedValue({ text: '<article>source</article>', contentType: 'text/html', status: 200 });
  mocks.parse.mockReturnValue({ title: 'Filmartikel', body_text: 'Research '.repeat(20) });
  mocks.upsert.mockResolvedValue({ added: 1, updated: 0, unchanged: 0 });
});
it('uses scoped discovery, stateless fetch and preserves the actual feed publication date', async () => {
  await runIngestToFirestore({ source: 'soundvenue', limit: 20 });
  expect(mocks.feed).toHaveBeenCalledWith('soundvenue');
  expect(mocks.sitemap).toHaveBeenCalledWith({ source: 'soundvenue', persistCache: false });
  expect(mocks.fetch).toHaveBeenCalledWith('https://soundvenue.com/film/a', expect.objectContaining({ persistCache: false }));
  expect(mocks.upsert.mock.calls[0][0][0]).toMatchObject({ sourceName: 'Soundvenue', published_at: '2026-09-09T10:00:00Z' });
  expect(mocks.prune).not.toHaveBeenCalled();
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
