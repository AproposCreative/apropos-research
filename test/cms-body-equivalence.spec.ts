import { expect, it } from 'vitest';
import { sameCmsBody } from '@/lib/articles/cms-body-equivalence';

it('tolerates serialization whitespace and entity encoding', () => {
  expect(sameCmsBody('<p>Kunst &amp; kultur</p>\n<p>Ny tekst.</p>', '<p>Kunst & kultur</p><p>Ny tekst.</p>')).toBe(true);
});
it('preserves semantic word boundaries', () => {
  expect(sameCmsBody('<p>En</p><p>anden</p>', '<p>Enanden</p>')).toBe(false);
});
it.each([
  ['<p>Ny tekst</p>', '<p>Gammel tekst</p>'],
  ['<p>Tekst</p><img src="https://example.com/a.jpg" alt="A">', '<p>Tekst</p><img src="https://example.com/b.jpg" alt="A">'],
  ['<p>Tekst</p><img src="https://example.com/a.jpg" alt="A">', '<p>Tekst</p>'],
  ['<p><a href="https://example.com/a">Kilde</a></p>', '<p><a href="https://example.com/b">Kilde</a></p>'],
  ['', ''],
])('rejects changed or missing content/targets', (expected, stored) => {
  expect(sameCmsBody(expected, stored)).toBe(false);
});
