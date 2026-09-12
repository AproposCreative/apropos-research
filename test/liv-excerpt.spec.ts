import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { livExcerpt } from '@/lib/liv/excerpt';

it.each(['Kort tekst.', 'En hel sætning!', 'Et spørgsmål?', 'Hun siger »ja.«', 'Et kort resumé'])('preserves complete short text: %s', text => {
  expect(livExcerpt(text)).toBe(text);
});
it('prefers the last complete sentence within the future excerpt budget', () => {
  expect(livExcerpt('Første sætning. Anden sætning. Det kan blive en længere historie.', 35)).toBe('Første sætning. Anden sætning.');
});
it('falls back to whole words and includes the ellipsis within the limit', () => {
  expect(livExcerpt('En lang sammensætning uden stop', 17)).toBe('En lang…');
  expect(livExcerpt('En lang sammensætning uden stop', 8)).toBe('En lang…');
  expect(livExcerpt('uafbrydeligtlangtord', 8)).toBe('…');
});
it('keeps HTML out of future excerpts and separates adjacent blocks', () => {
  expect(livExcerpt('<p>En &amp; to.</p><p>Tre.</p><script>secret</script><style>hidden</style>')).toBe('En & to. Tre.');
});
it('ends a legacy cut at its last complete sentence without inventing a continuation', () => {
  expect(livExcerpt('En hel sætning. Det kan', 360, { sourceText: 'En hel sætning. Det kan blive spændende.' })).toBe('En hel sætning.');
});
it('removes a legacy half-word using the exact unmodified source prefix', () => {
  expect(livExcerpt('Et sammensæ', 360, { sourceText: 'Et sammensætningsproblem.' })).toBe('Et…');
});
it('does not force an ellipsis onto a complete sentence prefix', () => {
  expect(livExcerpt('En hel sætning.', 360, { sourceText: 'En hel sætning. Mere.', truncated: true })).toBe('En hel sætning.');
});
it('conservatively removes an unproved final token from a known legacy cut', () => {
  expect(livExcerpt('Et gammelt afbru', 360, { truncated: true })).toBe('Et gammelt…');
  expect(livExcerpt('Et gammelt afbru', 360, { sourceText: 'Unrelated source', truncated: true })).toBe('Et gammelt…');
});
it('handles whitespace, empty text and existing ellipses deterministically', () => {
  expect(livExcerpt('  En\n hel   sætning.  ')).toBe('En hel sætning.');
  expect(livExcerpt('')).toBe('');
  expect(livExcerpt('Allerede forkortet…', 220, { truncated: true })).toBe('Allerede forkortet…');
  expect(livExcerpt('😀😀😀', 2)).toBe('…');
});
it.each([0, -1, 1.5, Infinity])('rejects invalid limit %s', limit => expect(() => livExcerpt('Text', limit)).toThrow('liv_excerpt_limit_invalid'));
it('uses the shared helper in both original and rewritten generation paths', () => {
  const source = readFileSync('lib/liv/generate-article.ts', 'utf8');
  expect(source.match(/excerpt = livExcerpt\(parsed.intro \|\| parsed.content\)/g)).toHaveLength(2);
  expect(source).not.toMatch(/slice\(0,\s*220\)/);
});
