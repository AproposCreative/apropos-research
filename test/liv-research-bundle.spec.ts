import { beforeEach, expect, it, vi } from 'vitest';
import { buildResearchBundle, extractResearchUrls, hasCopiedPassage } from '@/lib/liv/research-bundle';
import { isLineupTopic } from '@/lib/liv/research-qa';

it('preserves explicit source URLs but excludes trailer and invalid hosts', () => {
  expect(extractResearchUrls('Kilder: https://a24films.com/films/the-invite og https://kino.dk/film/100011240. Trailer https://www.youtube.com/watch?v=abc https://127.0.0.1/admin'))
    .toEqual(['https://a24films.com/films/the-invite', 'https://kino.dk/film/100011240']);
});
const read = vi.fn(async (url: string, id: string) => ({ url, id, title: 'Film', text: 'Dokumentation '.repeat(30), contentHash: 'hash', retrievedAt: '2026-09-09T12:00:00Z', publishedAt: null }));
beforeEach(() => read.mockClear());
it('keeps retrieved content and provenance rather than search snippets', async () => {
  const sources = await buildResearchBundle(['https://a24films.com/films/the-invite', 'https://kino.dk/film/100011240'], read);
  expect(sources).toHaveLength(2);
  expect(sources[0].text).toContain('Dokumentation');
});
it('blocks absent research', async () => {
  await expect(buildResearchBundle([], read)).rejects.toThrow('research_sources_unavailable');
});
it('does not count two URLs on the same host as sufficient research', async () => {
  await expect(buildResearchBundle(['https://a24films.com/a','https://a24films.com/b'], read)).rejects.toThrow('research_sources_unavailable');
});
it('does not treat failed downloads as evidence', async () => {
  await expect(buildResearchBundle(['https://a24films.com/a','https://kino.dk/b'], async () => { throw new Error('failed'); })).rejects.toThrow('research_sources_unavailable');
});
it('deduplicates tracking, www and slash variants while retaining the actual fetch host and path', async () => {
  const sources = await buildResearchBundle([
    'https://www.a24films.com/films/the-invite/?utm_source=openai&id=2&gclid=x#top',
    'https://a24films.com/films/the-invite?id=2',
    'https://www.a24films.com/films/the-invite/?id=2&UTM_campaign=research&fbclid=y',
    'https://kino.dk/film/100011240?utm_medium=search',
  ], read);
  expect(read.mock.calls).toEqual([
    ['https://www.a24films.com/films/the-invite/?id=2', 'S1'],
    ['https://kino.dk/film/100011240', 'S2'],
  ]);
  expect(sources.map(source => source.url)).toEqual(read.mock.calls.map(([url]) => url));
  expect(sources[0]).toMatchObject({ contentHash: 'hash', retrievedAt: '2026-09-09T12:00:00Z', publishedAt: null });
});
it('preserves meaningful query parameters and deduplicates reordered query strings', async () => {
  await buildResearchBundle([
    'https://a24films.com/film?id=1&lang=da&utm_source=openai',
    'https://a24films.com/film?lang=da&id=1',
    'https://a24films.com/film?id=2&lang=da',
    'https://kino.dk/film',
  ], read);
  expect(read.mock.calls.map(([url]) => url)).toEqual([
    'https://a24films.com/film?id=1&lang=da', 'https://a24films.com/film?id=2&lang=da', 'https://kino.dk/film',
  ]);
});
it('applies the eight-source cap after canonical dedupe and safe URL validation', async () => {
  const invalid = ['http://a24films.com/a', 'https://127.0.0.1/a', 'https://user:password@a24films.com/a',
    'https://publisher.internal/a', 'https://a24films.com:8443/a', 'not-a-url'];
  const duplicates = Array.from({ length: 10 }, (_, i) => `https://www.a24films.com/a?utm_source=${i}`);
  const independent = Array.from({ length: 9 }, (_, i) => `https://kino.dk/film/${i}`);
  const sources = await buildResearchBundle([...invalid, ...duplicates, ...independent], read);
  expect(sources).toHaveLength(8);
  expect(read.mock.calls).toEqual([
    ['https://www.a24films.com/a', 'S1'],
    ...independent.slice(0, 7).map((url, i) => [url, `S${i + 2}`]),
  ]);
});
it('does not count www or tracking variants as a second readable host', async () => {
  await expect(buildResearchBundle([
    'https://www.a24films.com/a?utm_source=openai', 'https://a24films.com/a', 'https://a24films.com/b',
  ], read)).rejects.toThrow('research_sources_unavailable');
  expect(read).toHaveBeenCalledTimes(2);
});
it('still requires readable text from the second host after canonicalization', async () => {
  const shortRead = vi.fn(async (url: string, id: string) => ({ ...await read(url, id),
    text: url.includes('kino.dk') ? 'Too short' : 'Dokumentation '.repeat(30) }));
  await expect(buildResearchBundle([
    'https://www.a24films.com/a?utm_source=openai', 'https://a24films.com/a', 'https://kino.dk/b',
  ], shortRead)).rejects.toThrow('research_sources_unavailable');
  expect(shortRead).toHaveBeenCalledTimes(2);
});
it('detects verbatim passages even beyond the previous 6000 character window', () => {
  const passage = 'en konkret lang sætning om en film der ikke må kopieres uden dokumentation';
  expect(hasCopiedPassage('andet '.repeat(2000) + passage, 'kilde '.repeat(2000) + passage)).toBe(true);
  expect(hasCopiedPassage('Olivia Wilde instruerer filmen', 'Filmen er instrueret af Olivia Wilde')).toBe(false);
});
it('does not activate lineup requirements from a negative editorial instruction', () => {
  expect(isLineupTopic({ topicTitle:'The Invite (2026), Olivia Wilde', directiveHint:'Ingen festival/lineup-afsnit', expandedDirective:'Undgå festivalprogram' })).toBe(false);
  expect(isLineupTopic({ topicTitle:'Roskilde Festival lineup 2026' })).toBe(true);
});
