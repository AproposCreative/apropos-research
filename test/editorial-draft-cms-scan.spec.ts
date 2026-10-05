import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const locale = 'b'.repeat(24);
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_API_TOKEN: 'private-token', WEBFLOW_ARTICLES_COLLECTION_ID: 'a'.repeat(24), WEBFLOW_CMS_LOCALE_DK: 'b'.repeat(24) } }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
import { readEditorialCmsCandidates } from '@/lib/image-gen/webflow';
const fetcher = vi.fn();
const row = (i: number, draft = false) => ({ id: i.toString(16).padStart(24, '0'), cmsLocaleId: locale, isDraft: draft,
  lastPublished: draft ? null : '2026-10-01T10:00:00Z', lastUpdated: '2026-10-05T10:00:00Z', fieldData: { name: `Kladde ${i}`, content: '<p>Indhold</p>' } });
const page = (items: unknown[], total = 250) => new Response(JSON.stringify({ items, pagination: { total } }), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetcher); });
afterEach(() => vi.unstubAllGlobals());
it('requests newest-first DK staged items, stops after enough drafts, and never fetches individual article text', async () => {
  fetcher.mockResolvedValue(page(Array.from({ length: 100 }, (_, i) => row(i, i < 5))));
  const result = await readEditorialCmsCandidates(5);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toContain(`cmsLocaleId=${locale}`); expect(url).toContain('sortBy=lastUpdated&sortOrder=desc');
  expect(request).toMatchObject({ cache: 'no-store', redirect: 'error' }); expect(request.method).toBeUndefined();
  expect(result).toMatchObject({ rowsRead: 100, complete: false });
});
it('skips image-only placeholders when deciding whether enough drafts have been read', async () => {
  fetcher.mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => ({ ...row(i, true), fieldData: { name: 'Billede', content: '<img src="a">' } }))))
    .mockResolvedValueOnce(page([row(100, true)], 101));
  const result = await readEditorialCmsCandidates(1);
  expect(fetcher).toHaveBeenCalledTimes(2); expect(result.complete).toBe(true);
  expect(fetcher.mock.calls[1][0]).toContain('offset=100');
});
it('caps scans at three pages and reports incomplete coverage rather than scanning a speculative archive', async () => {
  fetcher.mockImplementation(async () => page(Array.from({ length: 100 }, (_, i) => row(i)), 1000));
  expect(await readEditorialCmsCandidates(5, 'ukendt')).toMatchObject({ rowsRead: 300, complete: false, maxRows: 300 });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('fails closed on locale/shape errors and does not retry upstream errors', async () => {
  fetcher.mockResolvedValueOnce(page([{ ...row(1, true), cmsLocaleId: undefined }]));
  await expect(readEditorialCmsCandidates(1)).rejects.toThrow('mcp_cms_locale_mismatch');
  fetcher.mockResolvedValueOnce(new Response('private upstream', { status: 429 }));
  await expect(readEditorialCmsCandidates(1)).rejects.toThrow('image_gen_cms_429');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
