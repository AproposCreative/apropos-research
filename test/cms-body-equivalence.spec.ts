import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { sameCmsBody, sameCmsBodyWithStoredImages } from '@/lib/articles/cms-body-equivalence';

it('tolerates serialization whitespace and entity encoding', () => {
  expect(sameCmsBody('<p>Kunst &amp; kultur</p>\n<p>Ny tekst.</p>', '<p>Kunst & kultur</p><p>Ny tekst.</p>')).toBe(true);
});
const original = '<p>Tekst <a href="https://source.test">Kilde</a></p><figure><img src="https://cdn.prod.website-files.com/site/original.jpg" alt="A"><figcaption>Netflix</figcaption></figure>';
const rehosted = original.replace('site/original.jpg', 'collection/rehosted.jpeg');
const png = () => sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).png().toBuffer();
it('accepts Webflow rehosting only after exact raster byte proof', async () => {
  const bytes = await png(), read = vi.fn().mockResolvedValue(bytes);
  expect(sameCmsBody(original, rehosted)).toBe(false);
  expect(await sameCmsBodyWithStoredImages(original, rehosted, read)).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
  expect(await sameCmsBodyWithStoredImages(original, original, read)).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
});
it.each([
  rehosted.replace('Kilde</a>', 'Andet</a>'), rehosted.replace('source.test', 'other.test'),
  rehosted.replace('alt="A"', 'alt="B"'), rehosted.replace('Netflix</figcaption>', 'Anden</figcaption>'),
  rehosted.replace('cdn.prod.website-files.com', 'internal.invalid'), rehosted.replace('<img ', '<img srcset="https://other.test/img.jpg 2x" '),
])('does not excuse altered copy, captions, targets or untrusted destinations', async stored => {
  const read = vi.fn(); expect(await sameCmsBodyWithStoredImages(original, stored, read)).toBe(false); expect(read).not.toHaveBeenCalled();
});
it('rejects different bytes, zero bytes, HTML and unavailable files without retries', async () => {
  const red = await png(), blue = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'blue' } }).png().toBuffer();
  for (const value of [blue, Buffer.alloc(0), Buffer.from('<html>Blocked</html>')]) {
    const read = vi.fn().mockResolvedValueOnce(red).mockResolvedValueOnce(value);
    expect(await sameCmsBodyWithStoredImages(original, rehosted, read)).toBe(false); expect(read).toHaveBeenCalledTimes(2);
  }
  const offline = vi.fn().mockRejectedValue(Error('timeout'));
  expect(await sameCmsBodyWithStoredImages(original, rehosted, offline)).toBe(false); expect(offline).toHaveBeenCalledTimes(1);
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
