import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetchText: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/media-source-validation', async original => ({ ...await original<typeof import('@/lib/media-source-validation')>(), downloadMediaXml: mocks.download }));
vi.mock('@/src/fetch/fetch', () => ({ fetchText: mocks.fetchText }));
vi.mock('@/lib/getMediaSources', () => ({ getMediaSources: () => [
  { id: 'fixture', enabled: true, baseUrl: 'https://fixture.example', sitemapIndex: '/rss' },
] }));
import { discoverFromFeed } from '@/src/discovery/feeds';
import { discoverFromSitemaps } from '@/src/discovery/sitemap';
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
it('uses validated Atom type even when the URL has no feed hint, preserving date and alternate link', async () => {
  mocks.download.mockResolvedValue({ text: '<feed><entry><link rel="self" href="https://shared.example/xml/1"/><link rel="alternate" href="https://shared.example/story"/><published>2026-09-13T08:00:00Z</published><updated>2026-09-14T08:00:00Z</updated></entry></feed>', url: 'https://shared.example/latest' });
  const sources = [{ id: 'shared', name: 'Shared', enabled: true, baseUrl: 'https://shared.example', sitemapIndex: '/latest', check: { kind: 'atom' } }];
  expect(await discoverFromFeed(undefined, sources)).toEqual([{ url: 'https://shared.example/story', published_at: '2026-09-13T08:00:00Z', source: 'shared' }]);
  expect(await discoverFromSitemaps({ sources })).toEqual([]);
  expect(mocks.download).toHaveBeenCalledTimes(1);
});
it('does not download configured RSS again in the sitemap pass', async () => {
  expect(await discoverFromSitemaps({ sources: [{ id: 'shared', name: 'Shared', enabled: true, baseUrl: 'https://shared.example', sitemapIndex: '/rss' }] })).toEqual([]);
  expect(mocks.download).not.toHaveBeenCalled();
});
it('does not guess a special publisher feed when explicit configuration is a sitemap', async () => {
  expect(await discoverFromFeed(undefined, [{ id: 'ekkofilm', name: 'Ekko', enabled: true, baseUrl: 'https://ekkofilm.dk', sitemapIndex: '/sitemap.xml' }])).toEqual([]);
  expect(mocks.download).not.toHaveBeenCalled();
});
it('respects an explicitly empty shared list without trying default feeds or sitemaps', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await discoverFromFeed(undefined, [])).toEqual([]);
  expect(await discoverFromSitemaps({ sources: [] })).toEqual([]);
  expect(fetch).not.toHaveBeenCalled(); expect(mocks.fetchText).not.toHaveBeenCalled();
});
it('uses an explicitly configured shared feed and excludes disabled sources', async () => {
  const fetch = vi.fn();
  mocks.download.mockResolvedValue({ text: '<rss><channel><item><link>https://shared.example/article</link></item></channel></rss>', url: 'https://shared.example/rss' });
  vi.stubGlobal('fetch', fetch);
  const sources = [{ id: 'shared', name: 'Shared', enabled: true, baseUrl: 'https://shared.example', sitemapIndex: '/rss' },
    { id: 'disabled', name: 'Disabled', enabled: false, baseUrl: 'https://disabled.example', sitemapIndex: '/rss' }];
  expect(await discoverFromFeed(undefined, sources)).toEqual([{ url: 'https://shared.example/article', published_at: undefined, source: 'shared' }]);
  expect(fetch).not.toHaveBeenCalled(); expect(mocks.download).toHaveBeenCalledTimes(1); expect(mocks.download.mock.calls[0][0]).toBe('https://shared.example/rss');
});
it('preserves RSS publication dates through the hardened transport', async () => {
  mocks.download.mockResolvedValue({ text: '<rss><channel><item><link>https://shared.example/article</link><pubDate>2026-09-13T08:00:00Z</pubDate></item></channel></rss>', url: 'https://shared.example/rss' });
  const result = await discoverFromFeed(undefined, [{ id: 'shared', name: 'Shared', enabled: true, baseUrl: 'https://shared.example', sitemapIndex: '/rss' }]);
  expect(result[0].published_at).toBe('2026-09-13T08:00:00Z');
});
it('uses hardened transport for nested configured sitemaps and never the old fetcher', async () => {
  mocks.download.mockResolvedValueOnce({ text: '<sitemapindex><sitemap><loc>https://shared.example/leaf.xml</loc></sitemap></sitemapindex>', url: 'https://shared.example/sitemap.xml' })
    .mockResolvedValueOnce({ text: '<urlset><url><loc>https://shared.example/article</loc></url></urlset>', url: 'https://shared.example/leaf.xml' });
  expect(await discoverFromSitemaps({ sources: [{ id: 'shared', name: 'Shared', enabled: true, baseUrl: 'https://shared.example', sitemapIndex: '/sitemap.xml' }] })).toEqual(['https://shared.example/article']);
  expect(mocks.fetchText).not.toHaveBeenCalled(); expect(mocks.download).toHaveBeenCalledTimes(2);
  expect(mocks.download.mock.calls[0][1]).toBe(mocks.download.mock.calls[1][1]);
});
it('does not guess feeds for an explicit sitemap configuration', async () => {
  expect(await discoverFromFeed(undefined, [{ id: 'shared', name: 'Shared', enabled: true, baseUrl: 'https://shared.example', sitemapIndex: '/sitemap.xml' }])).toEqual([]);
  expect(mocks.download).not.toHaveBeenCalled();
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
