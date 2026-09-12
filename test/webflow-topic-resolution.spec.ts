import { expect, it, vi } from 'vitest';
import { readWebflowTopicCollection, resolveWebflowTopicId, resolveWebflowTopics } from '@/lib/webflow/topic-resolution';
import { buildTopicsSelectedForCms } from '@/lib/liv/cms-webflow-meta';
import type { GeneratedArticle } from '@/lib/liv/generate-article';

const film = '67dbf17ba540975b5b21c303', culture = '67dbf17ba540975b5b21c301';
const reviews = '67e6f8f2e077ea42a9b95b87', tv = '67dbf52a4ac2cf0073a9b0ef';
const topics = [
  [film, 'Film', 'film'], [culture, 'Kultur & Mening', 'kultur-mening'],
  [reviews, 'Anmeldelser', 'anmeldelser'], [tv, 'TV-serier', 'serier'],
  ['67e6ee5034ae539291e9c6d0', 'Koncerter', 'koncerter'],
  ['69ea1d6141422fceaedbedca', 'Festival', 'festival'], ['68f73f675da21fa296b1b6e7', 'Gaming', 'gaming'],
].map(([id, name, slug]) => ({ id, fieldData: { name, slug }, isDraft: false, cmsLocaleId: 'a'.repeat(24) }));
it.each([[' FILM ', film], ['Kultur', culture], ['kultur-og-mening', culture], ['TV', tv], ['serier', tv],
  ['tv-series', tv], ['anmeldelse', reviews], [film, film]])('resolves exact or explicit alias %s', (selection, expected) => {
  expect(resolveWebflowTopicId(selection, topics)).toBe(expected);
});
it.each(['Musik', 'Filmfestival', 'Film og identitet', 'Kulturpolitik', 'identitet', 'lgbt'])('never fuzzy-matches %s', selection => {
  expect(resolveWebflowTopicId(selection, topics)).toBeUndefined();
});
it('ignores free-form candidates, preserves primary order and deduplicates aliases', () => {
  expect(resolveWebflowTopics(['Film', 'lgbt', 'identitet', 'Anmeldelser', 'film', 'Kultur'], topics)).toEqual([film, reviews, culture]);
  expect(() => resolveWebflowTopics(['Musik', 'identitet'], topics)).toThrow('unresolved');
});
it('rejects ambiguous exact names/aliases independently of collection order and ignores unavailable items', () => {
  const ambiguous = [...topics, { ...topics[0], id: 'f'.repeat(24) }];
  for (const items of [ambiguous, [...ambiguous].reverse()]) expect(() => resolveWebflowTopicId('Film', items)).toThrow('ambiguous');
  expect(resolveWebflowTopicId('Film', topics.map(item => ({ ...item, isArchived: true })))).toBeUndefined();
  expect(resolveWebflowTopicId('Film', topics.map(item => ({ ...item, isDraft: true })))).toBeUndefined();
});
it('scans pagination once and filters to the requested locale without returning partial failures', async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({ ...topics[0], id: i.toString(16).padStart(24, '0') }));
  const read = vi.fn().mockResolvedValueOnce({ items: first, pagination: { total: 101, offset: 0 } })
    .mockResolvedValueOnce({ items: [topics[1]], pagination: { total: 101, offset: 100 } });
  expect(await readWebflowTopicCollection(read, 'a'.repeat(24))).toHaveLength(101);
  expect(read.mock.calls).toEqual([[0], [100]]);
  const failure = vi.fn().mockResolvedValueOnce({ items: first }).mockRejectedValueOnce(new Error('upstream'));
  await expect(readWebflowTopicCollection(failure)).rejects.toThrow('upstream');
  expect(await readWebflowTopicCollection(async () => ({ items: topics }), 'b'.repeat(24))).toEqual([]);
});
it.each([{}, { items: [{}] }, { items: topics, pagination: { total: 8, offset: 0 } },
  { items: topics, pagination: { total: 7, offset: 100 } }])('rejects malformed/incomplete collection response', async page => {
  await expect(readWebflowTopicCollection(async () => page)).rejects.toThrow(/webflow_topics_/);
});
const article = { title: 'Et nyt perspektiv', content: '<p>Analyse</p>', tags: ['lgbt', 'identitet'], section: 'Kultur' } as GeneratedArticle;
it.each([['film', film], ['tv-series', tv]] as const)('prioritizes explicit %s, then actual review format', (subjectType, primary) => {
  const selected = buildTopicsSelectedForCms({ title: article.title, score: 0 }, { ...article, subjectType, articleFormat: 'research-review' });
  expect(resolveWebflowTopics(selected, topics)).toEqual([primary, reviews, culture]);
});
it('never labels an analysis as a review from tags, section, category or stars alone', () => {
  const selected = buildTopicsSelectedForCms({ title: article.title, score: 0, category: 'Anmeldelser', tags: ['Anmeldelse'] },
    { ...article, subjectType: 'film', section: 'Anmeldelser', articleFormat: 'article', tags: ['Anmeldelser'], rating: 4 });
  expect(resolveWebflowTopics(selected, topics)).toEqual([film, culture]);
});
it('always retains the actual broad fallback with novelty tags, unknown section and a full tag list', () => {
  const selected = buildTopicsSelectedForCms({ title: article.title, score: 0 }, { ...article, subjectType: 'culture',
    section: 'Livsstil', tags: Array.from({ length: 20 }, (_, i) => `Ukendt emne ${i}`) });
  expect(selected.length).toBeLessThanOrEqual(12);
  expect(resolveWebflowTopics(selected, topics)).toEqual([culture]);
});
it.each([
  ['Spotify og den danske scene', []], ['En koncert i byen', ['Koncerter']], ['Heartland festival', ['Festival']],
])('keeps music cues distinct: %s', (title, categories) => {
  const selected = buildTopicsSelectedForCms({ title, score: 0 }, { ...article, title, subjectType: 'music', tags: [] });
  expect(selected.filter(name => ['Festival', 'Koncerter'].includes(name))).toEqual(categories);
});
