import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), slugs: vi.fn(), topics: vi.fn() }));
vi.mock('@/lib/api/internal-auth', () => ({ internalApiHeaders: () => ({}) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/liv/daily-history-store', () => ({ getRecentLivDailySlugs: mocks.slugs, getRecentLivDailyTopics: mocks.topics }));
import { pickLivTopic } from '@/lib/liv/pick-topic';

const options = { baseUrl: 'https://app.example' };
const article = {
  title: 'Ny musik fra danske kunstnere', category: 'Musik', tags: ['kultur'],
  date: '2026-09-12T09:00:00Z', url: 'https://publisher.example/music',
  source: 'Publisher', content: 'Dokumenteret omtale af et nyt album.',
};
const feed = (articles: unknown[]) => mocks.fetch.mockImplementation(async () => Response.json({ articles }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubEnv('LIV_TOPIC_TITLE_BLOCKLIST', '');
  mocks.slugs.mockResolvedValue(new Set());
  mocks.topics.mockResolvedValue(new Set());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('selects an available source after excluded candidates and preserves source metadata', async () => {
  mocks.topics.mockResolvedValue(new Set(['musik og kvinder på scenen']));
  feed([{ ...article, title: 'Musik og kvinder på scenen' }, article]);
  expect(await pickLivTopic(options)).toMatchObject({
    title: article.title, source: { title: article.title, url: article.url,
      sourceName: article.source, excerpt: article.content, publishedAt: '2026-09-12T09:00:00.000Z' },
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it.each([undefined, '', 'http://publisher.example/a', 'https://127.0.0.1/a', 'https://user:password@publisher.example/a'])('skips unusable source URLs and selects the next real source: %s', url => {
  feed([{ ...article, title: 'Musik, kunst, kvinder og identitet', url }, article]);
  return expect(pickLivTopic(options)).resolves.toMatchObject({ title: article.title });
});
it('ignores malformed rows without losing valid candidates', async () => {
  feed([null, { ...article, title: 123 }, { ...article, tags: 'musik' }, article]);
  expect(await pickLivTopic(options)).toMatchObject({ title: article.title });
});
it('reports a completely malformed feed as a schema failure', async () => {
  feed([null, { title: 123 }]);
  await expect(pickLivTopic(options)).rejects.toThrow('liv_trending_invalid_response');
});
it.each(['2026-09-04T12:00:00Z', '2026-09-13', '12/09/2026', undefined])('keeps stale, future and unverified dates out: %s', date => {
  feed([{ ...article, date }]);
  return expect(pickLivTopic(options)).resolves.toBeNull();
});
it('does not lower Liv relevance to fill an empty queue', async () => {
  feed([{ ...article, title: 'Prisen på benzin stiger igen', category: 'Økonomi', tags: [], content: '' }]);
  expect(await pickLivTopic(options)).toBeNull();
});
it('retains published slugs, explicit exclusions and the title blocklist', async () => {
  feed([article]);
  mocks.slugs.mockResolvedValue(new Set(['ny-musik-fra-danske-kunstnere']));
  expect(await pickLivTopic(options)).toBeNull();
  mocks.slugs.mockResolvedValue(new Set());
  expect(await pickLivTopic({ ...options, excludedTitles: [article.title.toUpperCase()] })).toBeNull();
  vi.stubEnv('LIV_TOPIC_TITLE_BLOCKLIST', 'danske kunstnere');
  expect(await pickLivTopic(options)).toBeNull();
});
it.each([{ articles: [] }, { articles: [article] }])('does not revive an excluded hint through synthetic fallback', async ({ articles }) => {
  feed(articles);
  const hinted = { ...options, topicHint: 'Teater i København', mustUseTrending: false };
  mocks.topics.mockResolvedValue(new Set(['teater i københavn']));
  expect(await pickLivTopic(hinted)).toBeNull();
  mocks.topics.mockResolvedValue(new Set());
  expect(await pickLivTopic({ ...hinted, excludedTitles: ['Teater i København'] })).toBeNull();
  vi.stubEnv('LIV_TOPIC_TITLE_BLOCKLIST', 'københavn');
  expect(await pickLivTopic(hinted)).toBeNull();
});
it('does not manufacture a synthetic topic from whitespace', async () => {
  feed([]);
  expect(await pickLivTopic({ ...options, topicHint: '   ', mustUseTrending: false })).toBeNull();
});
