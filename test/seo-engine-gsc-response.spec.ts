import { afterEach, expect, it, vi } from 'vitest';
import { defaultGscFetch } from '../lib/seo-engine/search-signals';
afterEach(() => vi.unstubAllGlobals());
const input = { siteUrl: 'sc-domain:aproposmagazine.com', token: 'fixture', body: { rowLimit: 1 } };
it.each(['not JSON', JSON.stringify({ rows: {} }), JSON.stringify({ rows: [{ keys: ['url'], impressions: 5 }] }),
  JSON.stringify({ rows: [{ keys: ['url'], impressions: -1, clicks: 0, ctr: 0, position: 3 }] })])('rejects malformed Google data instead of zero-filling: %s', async body => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
  expect(await defaultGscFetch(input)).toMatchObject({ ok: false, status: 502 });
});
it('accepts real empty rows and numeric zero without conflating them', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(JSON.stringify({ rows: [{ clicks: 0, impressions: 0, ctr: 0, position: 0 }] }))));
  expect(await defaultGscFetch(input)).toEqual({ ok: true, rows: [] });
  expect(await defaultGscFetch(input)).toMatchObject({ ok: true, rows: [{ keys: [], clicks: 0 }] });
});
