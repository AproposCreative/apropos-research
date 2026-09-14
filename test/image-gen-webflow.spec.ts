import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_API_TOKEN: 'test-token', WEBFLOW_ARTICLES_COLLECTION_ID: 'c'.repeat(24), WEBFLOW_CMS_LOCALE_DK: 'd'.repeat(24) } }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
import { listImageGenArticles, readImageGenArticle, patchImageGenDraft } from '@/lib/image-gen/webflow';
const fetchMock = vi.fn();
const row = (name = 'Gobs på Wonderfestiwall') => ({ id: 'a'.repeat(24), cmsLocaleId: 'd'.repeat(24), isDraft: true,
  fieldData: { name, content: '<p>Gobs spillede på Wonderfestiwall.</p>', thumb: null } });
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
it('reads only the Danish staged article without publishing or changing draft status', async () => {
  fetchMock.mockResolvedValue(Response.json(row()));
  const result = await readImageGenArticle('a'.repeat(24)); expect(result.isDraft).toBe(true);
  expect(result.article.sections[0].text).toBe('Gobs spillede på Wonderfestiwall.');
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toContain(`/items/${'a'.repeat(24)}?cmsLocaleId=${'d'.repeat(24)}`);
  expect(options.method).toBeUndefined(); expect(options.redirect).toBe('error');
});
it('rejects a different locale, wrong item identity and malformed source content', async () => {
  for (const bad of [{ ...row(), cmsLocaleId: 'e'.repeat(24) }, { ...row(), id: 'b'.repeat(24) }, { ...row(), fieldData: { name: 'Missing body' } }]) {
    fetchMock.mockResolvedValue(Response.json(bad)); await expect(readImageGenArticle('a'.repeat(24))).rejects.toThrow();
  }
});
it('preserves a cursor for bounded search instead of claiming the whole archive was searched', async () => {
  fetchMock.mockImplementation(() => Promise.resolve(Response.json({ items: Array.from({ length: 100 }, () => row('Other title')) })));
  expect(await listImageGenArticles({ query: 'Gobs' })).toEqual({ articles: [], nextCursor: 300 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('finds matches case-insensitively and excludes archived articles', async () => {
  fetchMock.mockResolvedValue(Response.json({ items: [row(), { ...row(), isArchived: true }] }));
  const result = await listImageGenArticles({ query: 'gObS' });
  expect(result.articles).toHaveLength(1); expect(result.nextCursor).toBeNull();
});
it('PATCHes only staged fields without publish, isDraft or isArchived flags', async () => {
  fetchMock.mockResolvedValue(Response.json(row()));
  await patchImageGenDraft('a'.repeat(24), { content: '<p>Preserved text.</p>' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`https://api.webflow.com/v2/collections/${'c'.repeat(24)}/items/${'a'.repeat(24)}`);
  expect(init.method).toBe('PATCH'); expect(JSON.parse(init.body)).toEqual({ cmsLocaleId: 'd'.repeat(24), fieldData: { content: '<p>Preserved text.</p>' } });
  await expect(patchImageGenDraft('a'.repeat(24), { name: 'Changed title' })).rejects.toThrow('fields_invalid');
  expect(fetchMock).toHaveBeenCalledOnce();
});
