import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetchText: vi.fn() }));
vi.mock('@/src/fetch/fetch', () => ({ fetchText: mocks.fetchText }));
vi.mock('@/lib/getMediaSources', () => ({ getMediaSources: () => [
  { id: 'fixture', enabled: true, baseUrl: 'https://fixture.example', sitemapIndex: '/rss' },
] }));
import { discoverFromFeed } from '@/src/discovery/feeds';
import { discoverFromSitemaps } from '@/src/discovery/sitemap';
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
it('respects an explicitly empty shared list without trying default feeds or sitemaps', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await discoverFromFeed(undefined, [])).toEqual([]);
  expect(await discoverFromSitemaps({ sources: [] })).toEqual([]);
  expect(fetch).not.toHaveBeenCalled(); expect(mocks.fetchText).not.toHaveBeenCalled();
});
it('uses an explicitly configured shared feed and excludes disabled sources', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('<rss><channel><item><link>https://shared.example/article</link></item></channel></rss>', { headers: { 'content-type': 'application/xml' } }));
  vi.stubGlobal('fetch', fetch);
  const sources = [{ id: 'shared', name: 'Shared', enabled: true, baseUrl: 'https://shared.example', sitemapIndex: '/rss' },
    { id: 'disabled', name: 'Disabled', enabled: false, baseUrl: 'https://disabled.example', sitemapIndex: '/rss' }];
  expect(await discoverFromFeed(undefined, sources)).toEqual([{ url: 'https://shared.example/article', published_at: undefined, source: 'shared' }]);
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toBe('https://shared.example/rss');
});
it('reads a single RSS item and trims its canonical URL', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<rss><channel><item><link> https://fixture.example/article </link><pubDate>2026-09-09</pubDate></item></channel></rss>', { headers: { 'content-type': 'application/xml' } })));
  expect(await discoverFromFeed('fixture')).toEqual([{ url: 'https://fixture.example/article', published_at: '2026-09-09', source: 'fixture' }]);
});
it('handles single-entry nested sitemap indexes without using the file cache', async () => {
  const xml = (text: string) => ({ text, contentType: 'application/xml', status: 200 });
  mocks.fetchText
    .mockResolvedValueOnce(xml('<sitemapindex><sitemap><loc>https://fixture.example/nested.xml</loc></sitemap></sitemapindex>'))
    .mockResolvedValueOnce(xml('<sitemapindex><sitemap><loc>https://fixture.example/leaf.xml</loc></sitemap></sitemapindex>'))
    .mockResolvedValueOnce(xml('<urlset><url><loc>https://fixture.example/article</loc></url></urlset>'));
  expect(await discoverFromSitemaps({ source: 'fixture', persistCache: false })).toEqual(['https://fixture.example/article']);
  for (const call of mocks.fetchText.mock.calls) expect(call[1]).toEqual({ persistCache: false });
});
