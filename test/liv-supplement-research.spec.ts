import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';

const mocks = vi.hoisted(() => ({ search: vi.fn(), retrieve: vi.fn() }));
vi.mock('@/lib/research/service', () => ({ getResearch: mocks.search }));
vi.mock('@/lib/liv/model-config', () => ({ livModels: () => ({ utility: 'fixture-utility' }) }));
vi.mock('@/lib/factcheck/source-reader', async original => ({
  ...await original<typeof import('@/lib/factcheck/source-reader')>(), retrieveSource: mocks.retrieve,
}));
import { supplementLivResearch } from '@/lib/liv/supplement-research';

const now = '2026-09-12T12:00:00.000Z';
const lead = (url: string) => ({ url, title: 'Search title', snippet: 'Search date 2026-09-12', source: 'Search' });
const results = (urls: string[]) => ({ sources: urls.map(lead) });
const article = {
  title: 'Alle Guds farver', subtitle: 'En dokumentar', intro: 'Introduktion', content: '<p>Gemt artikel</p>',
  slug: 'alle-guds-farver', excerpt: 'Gemt uddrag', section: 'Film', tags: ['dokumentar'], rawResponse: 'saved raw',
  selectedImage: { url: 'https://images.example/hero.webp', articleHash: 'saved-image-hash' },
  preparedMedia: [{ role: 'hero' }, { role: 'body-1' }, { role: 'body-2' }],
  researchSources: [
    { title: 'Kritik', source: 'Soundvenue', url: 'https://soundvenue.com/film', publishedAt: '2026-09-10T00:00:00Z', contentHash: 'original1' },
    { title: 'Producent', source: 'New Tales', url: 'https://www.newtales.dk/', publishedAt: null, contentHash: 'original2' },
    { title: 'Film', source: 'Kino', url: 'https://kino.dk/film', publishedAt: null, contentHash: 'original3' },
  ],
} as GeneratedArticle;
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now));
  mocks.search.mockResolvedValue(results([]));
  mocks.retrieve.mockImplementation(async (url: string, id: string) => ({
    id, url, title: 'Retrieved page title', text: 'Faktisk hentet dokumentation. '.repeat(20),
    contentHash: 'retrieved-hash', retrievedAt: now, publishedAt: '2026-09-11T10:00:00Z',
  }));
});
afterEach(() => vi.useRealTimers());

it('starts both bounded utility searches in parallel with the exact quoted topic and host exclusions', async () => {
  let release!: (value: ReturnType<typeof results>) => void;
  mocks.search.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const first = Promise.withResolvers<ReturnType<typeof results>>();
  mocks.search.mockImplementationOnce(() => first.promise);
  const pending = supplementLivResearch(article, 'Alle Guds farver');
  expect(mocks.search).toHaveBeenCalledTimes(2);
  for (const [query, options] of mocks.search.mock.calls) {
    expect(query).toContain('"Alle Guds farver"');
    for (const domain of ['soundvenue.com', 'newtales.dk', 'kino.dk']) expect(query).toContain(`-site:${domain}`);
    expect(options).toEqual({ maxResults: 5, model: 'fixture-utility', timeoutMs: 30000 });
  }
  first.resolve(results([])); release(results([])); await pending;
});

it('preserves all existing records and every non-research field, including text, media and image hash', async () => {
  const before = structuredClone(article);
  mocks.search.mockResolvedValueOnce(results(['https://www.press.example/news?utm_source=openai']));
  const updated = await supplementLivResearch(article, article.title);
  expect(article).toEqual(before);
  expect(updated).toEqual({ ...article, researchSources: [...article.researchSources!, {
    title: 'Retrieved page title', source: 'www.press.example', url: 'https://www.press.example/news',
    snippet: ('Faktisk hentet dokumentation. '.repeat(20)).slice(0, 240), contentHash: 'retrieved-hash',
    retrievedAt: now, publishedAt: '2026-09-11T10:00:00Z',
  }], researchSupplementedAt: now });
  expect(updated.researchSources![0]).toBe(article.researchSources![0]);
  expect(updated.preparedMedia).toBe(article.preparedMedia);
  expect(updated.selectedImage).toBe(article.selectedImage);
  expect(livImageArticleHash(updated)).toBe(livImageArticleHash(article));
});

it('prioritizes retrieved dated pages across both queries before undated pages and caps total at eight', async () => {
  const undated = Array.from({ length: 5 }, (_, i) => `https://press.example/undated-${i}`);
  const dated = Array.from({ length: 3 }, (_, i) => `https://news.example/dated-${i}`);
  mocks.search.mockResolvedValueOnce(results(undated)).mockResolvedValueOnce(results(dated));
  mocks.retrieve.mockImplementation(async (url, id) => ({ id, url, title: 'Retrieved', text: 'evidence '.repeat(40),
    contentHash: 'hash', retrievedAt: now, publishedAt: url.includes('/undated') ? null : '2026-09-11T00:00:00Z' }));
  const updated = await supplementLivResearch(article, article.title);
  expect(mocks.retrieve).toHaveBeenCalledTimes(8);
  expect(updated.researchSources).toHaveLength(8);
  expect(updated.researchSources!.slice(0, 3)).toEqual(article.researchSources);
  expect(updated.researchSources!.slice(3).map(source => source.url)).toEqual([...dated, ...undated.slice(0, 2)]);
});

it('filters unsafe URLs, existing hosts, and canonical duplicates before retrieval', async () => {
  mocks.search.mockResolvedValueOnce(results([
    'https://www.soundvenue.com/new', 'https://news.kino.dk/new', 'https://127.0.0.1/private',
    'https://user:password@press.example/private', 'https://www.press.example/news/?utm_source=openai',
  ])).mockResolvedValueOnce(results([
    'https://press.example/news', 'http://press.example/unsafe', 'https://publisher.internal/a',
    'https://www.newtales.dk/other', 'https://www.press.example/news/?gclid=x',
  ]));
  const updated = await supplementLivResearch(article, article.title);
  expect(mocks.retrieve.mock.calls).toEqual([['https://www.press.example/news/', expect.any(String)]]);
  expect(updated.researchSources).toHaveLength(4);
});

it('never trusts search dates or turns failed and short downloads into evidence', async () => {
  mocks.search.mockResolvedValueOnce(results(['https://press.example/undated', 'https://failed.example/news', 'https://short.example/news']));
  mocks.retrieve.mockResolvedValueOnce({ url: 'https://press.example/undated', title: 'Retrieved', text: 'evidence '.repeat(40),
    contentHash: 'hash', retrievedAt: now, publishedAt: null }).mockRejectedValueOnce(new Error('download failed'))
    .mockResolvedValueOnce({ url: 'https://short.example/news', text: 'short', publishedAt: '2026-09-11T00:00:00Z' });
  const updated = await supplementLivResearch(article, article.title);
  expect(updated.researchSources).toHaveLength(4);
  expect(updated.researchSources![3].publishedAt).toBeNull();
  expect(updated.researchSupplementedAt).toBe(now);
});

it('retains useful evidence when one search fails and records an empty attempt without inventing sources', async () => {
  mocks.search.mockRejectedValueOnce(new Error('provider failed')).mockResolvedValueOnce(results(['https://press.example/news']));
  expect((await supplementLivResearch(article, article.title)).researchSources).toHaveLength(4);
  mocks.search.mockRejectedValue(new Error('provider failed'));
  const empty = await supplementLivResearch(article, article.title);
  expect(empty.researchSources).toEqual(article.researchSources);
  expect(empty.researchSupplementedAt).toBe(now);
  mocks.search.mockClear();
  expect(await supplementLivResearch(empty, article.title)).toBe(empty);
  expect(mocks.search).not.toHaveBeenCalled();
});

it('preserves eight existing records without appending beyond the cap', async () => {
  const full = { ...article, researchSources: Array.from({ length: 8 }, (_, i) => ({ title: `Source ${i}`, source: 'Original', url: `https://original.example/${i}` })) };
  mocks.search.mockResolvedValue(results(['https://press.example/news']));
  const updated = await supplementLivResearch(full, article.title);
  expect(updated.researchSources).toEqual(full.researchSources);
  expect(updated.researchSources).toHaveLength(8);
});
