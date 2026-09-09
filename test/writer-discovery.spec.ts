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
