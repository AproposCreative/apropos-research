import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ fetch: vi.fn(), config: {} as Record<string, string>, env: {
  WEBFLOW_API_TOKEN: 'test-token', WEBFLOW_AUTHORS_COLLECTION_ID: 'a'.repeat(24), WEBFLOW_CMS_LOCALE_DK: 'b'.repeat(24),
} }));
vi.mock('@/lib/config/env', () => ({ env: state.env }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => state.config, saveWebflowConfig: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { fetchWebflowAuthorItems, webflowAuthorTov } from '@/lib/webflow/author-retrieval';
import { getWebflowAuthors } from '@/lib/webflow-service';
import { WebflowAuthors } from '@/lib/webflow-authors';
const input = { token: 'test-token', collectionId: 'a'.repeat(24), localeId: 'b'.repeat(24) };
const author = (id: string, name = id) => ({ id, cmsLocaleId: input.localeId,
  fieldData: { name, slug: name.toLowerCase().replace(/ /g, '-'), 'author-prompt': `<p>${name} own voice</p>` } });
beforeEach(() => {
  vi.clearAllMocks(); state.fetch.mockReset(); state.config = {};
  vi.stubGlobal('fetch', state.fetch);
  state.env.WEBFLOW_CMS_LOCALE_DK = input.localeId;
});
afterEach(() => vi.unstubAllGlobals());

it.each(['main', 'legacy'])('%s retrieves every author’s own actual author-prompt, including Liv, without needing a site ID', async api => {
  state.fetch.mockResolvedValue(Response.json({ items: [author('1', 'Liv Brandt'), author('2', 'Frederik Kragh'), author('3', 'Other Author')],
    pagination: { total: 3 } }));
  const authors = api === 'main' ? await getWebflowAuthors() : (await new WebflowAuthors().getAuthors()).authors!;
  expect(authors.map(item => [item.name, item.tov])).toEqual([
    ['Liv Brandt', 'Liv Brandt own voice'], ['Frederik Kragh', 'Frederik Kragh own voice'], ['Other Author', 'Other Author own voice'],
  ]);
  expect(authors[0].slug).toBe('liv-brandt');
  const [raw, options] = state.fetch.mock.calls[0];
  const url = new URL(raw);
  expect(url.origin + url.pathname).toBe(`https://api.webflow.com/v2/collections/${input.collectionId}/items`);
  expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '100', offset: '0', cmsLocaleId: input.localeId });
  expect(options).toMatchObject({ headers: { Authorization: 'Bearer test-token' }, redirect: 'error' });
  expect(options.signal).toBeInstanceOf(AbortSignal);
});

it('prefers actual author-prompt over every legacy alias', () => {
  expect(webflowAuthorTov({ 'author-prompt': '<p>Current voice</p>', authorPrompt: 'old1', 'author-tov': 'old2',
    tov: 'old3', toneOfVoice: 'old4' })).toBe('Current voice');
});
it.each(['authorPrompt', 'author-tov', 'tov', 'toneOfVoice'])('retains the %s legacy alias when actual TOV is absent or blank', key => {
  expect(webflowAuthorTov({ 'author-prompt': '<p> </p>', [key]: '<p>Own legacy voice</p>' })).toBe('Own legacy voice');
});
it('does not stringify malformed TOV or fabricate another author’s voice', () => {
  expect(webflowAuthorTov({ 'author-prompt': {}, tov: 123 })).toBe('');
});

it.each(['main', 'legacy'])('%s follows bounded collection pagination with the same Danish locale', async api => {
  const first = Array.from({ length: 100 }, (_, index) => author(String(index)));
  state.fetch.mockResolvedValueOnce(Response.json({ items: first, pagination: { total: 101 } }))
    .mockResolvedValueOnce(Response.json({ items: [author('last', 'Liv Brandt')], pagination: { total: 101 } }));
  const authors = api === 'main' ? await getWebflowAuthors() : (await new WebflowAuthors().getAuthors()).authors!;
  expect(authors).toHaveLength(101); expect(authors[100].tov).toBe('Liv Brandt own voice');
  expect(state.fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('offset'))).toEqual(['0', '100']);
  expect(state.fetch.mock.calls.every(([url]) => new URL(url).searchParams.get('cmsLocaleId') === input.localeId)).toBe(true);
});
it('omits locale filtering when no locale is configured', async () => {
  state.fetch.mockResolvedValue(Response.json({ items: [author('1')] }));
  await fetchWebflowAuthorItems({ ...input, localeId: undefined });
  expect(new URL(state.fetch.mock.calls[0][0]).searchParams.has('cmsLocaleId')).toBe(false);
});
it('advances by the actual returned count on a short non-final page', async () => {
  state.fetch.mockResolvedValueOnce(Response.json({ items: [author('1')], pagination: { total: 2 } }))
    .mockResolvedValueOnce(Response.json({ items: [author('2')], pagination: { total: 2 } }));
  expect(await fetchWebflowAuthorItems(input)).toHaveLength(2);
  expect(new URL(state.fetch.mock.calls[1][0]).searchParams.get('offset')).toBe('1');
});
it('does not substitute a different locale’s TOV or duplicate an author', async () => {
  state.fetch.mockResolvedValue(Response.json({ items: [author('1'), author('1'), { ...author('1'), cmsLocaleId: 'c'.repeat(24) }] }));
  expect(await fetchWebflowAuthorItems(input)).toEqual([author('1')]);
});
it('never makes more than ten page requests or silently returns a truncated collection', async () => {
  state.fetch.mockImplementation(async () => Response.json({ items: Array.from({ length: 100 }, (_, index) => author(String(index))),
    pagination: { total: 1001 } }));
  await expect(fetchWebflowAuthorItems(input)).rejects.toThrow('webflow_authors_page_limit');
  expect(state.fetch).toHaveBeenCalledTimes(10);
});
it('rejects upstream failures without reading or exposing the private response body', async () => {
  const json = vi.fn(); state.fetch.mockResolvedValue({ ok: false, status: 401, json });
  await expect(fetchWebflowAuthorItems(input)).rejects.toThrow('webflow_authors_http_401');
  expect(json).not.toHaveBeenCalled();
});
it.each([{ items: null }, { items: [{}] }, { items: [], pagination: { total: 1 } }])('rejects malformed or incomplete pages', async page => {
  state.fetch.mockResolvedValue(Response.json(page));
  await expect(fetchWebflowAuthorItems(input)).rejects.toThrow(/webflow_authors_(invalid|incomplete)_response/);
});
it('keeps configured main-service collection/token precedence', async () => {
  state.config = { apiToken: 'configured-token', authorsCollectionId: 'd'.repeat(24) };
  state.fetch.mockResolvedValue(Response.json({ items: [author('1')] }));
  await getWebflowAuthors();
  expect(new URL(state.fetch.mock.calls[0][0]).pathname).toContain('d'.repeat(24));
  expect(state.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer configured-token');
});
