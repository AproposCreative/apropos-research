import { expect, it, vi } from 'vitest';
import { buildResearchBundle, extractResearchUrls, hasCopiedPassage } from '@/lib/liv/research-bundle';
import { isLineupTopic } from '@/lib/liv/research-qa';

it('preserves explicit source URLs but excludes trailer and invalid hosts', () => {
  expect(extractResearchUrls('Kilder: https://a24films.com/films/the-invite og https://kino.dk/film/100011240. Trailer https://www.youtube.com/watch?v=abc https://127.0.0.1/admin'))
    .toEqual(['https://a24films.com/films/the-invite', 'https://kino.dk/film/100011240']);
});
const read = vi.fn(async (url: string, id: string) => ({ url, id, title: 'Film', text: 'Dokumentation '.repeat(30), contentHash: 'hash', retrievedAt: '2026-09-09T12:00:00Z', publishedAt: null }));
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
it('detects verbatim passages even beyond the previous 6000 character window', () => {
  const passage = 'en konkret lang sætning om en film der ikke må kopieres uden dokumentation';
  expect(hasCopiedPassage('andet '.repeat(2000) + passage, 'kilde '.repeat(2000) + passage)).toBe(true);
  expect(hasCopiedPassage('Olivia Wilde instruerer filmen', 'Filmen er instrueret af Olivia Wilde')).toBe(false);
});
it('does not activate lineup requirements from a negative editorial instruction', () => {
  expect(isLineupTopic({ topicTitle:'The Invite (2026), Olivia Wilde', directiveHint:'Ingen festival/lineup-afsnit', expandedDirective:'Undgå festivalprogram' })).toBe(false);
  expect(isLineupTopic({ topicTitle:'Roskilde Festival lineup 2026' })).toBe(true);
});
