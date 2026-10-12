import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const reader = vi.hoisted(() => vi.fn());
vi.mock('@/lib/liv/public-media-reader', () => ({ readPressMedia: reader }));
import { imageGenSearchSources, imageGenSearchText, inspectImageGenPressSources } from '@/lib/image-gen/press';
import { extractPressCandidates, validatePressRaster } from '@/lib/image-gen/press-candidates';
let photo: Buffer;
beforeEach(async () => { reader.mockReset(); photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'blue' } }).jpeg().toBuffer(); });
const mockRead = (html: string) => reader.mockImplementation(async (url, kind) => ({ bytes: kind === 'html' ? Buffer.from(html) : photo, finalUrl: url, contentType: kind === 'html' ? 'text/html' : 'image/jpeg', status: 200 }));
it('only consumes real search provenance, never model prose URLs', () => {
  expect(imageGenSearchSources({ output: [{ type: 'message', content: [{ text: 'https://fabricated.test/image.jpg',
    annotations: [{ type: 'url_citation', url: 'https://press.example.org/page' }] }] },
    { type: 'web_search_call', action: { sources: [{ url: 'https://127.0.0.1/private' }, { url: 'https://press.example.org/page' }] } }] }))
    .toEqual(['https://press.example.org/page']);
});
it('extracts only response text for the visual research brief', () => {
  expect(imageGenSearchText({ output: [{ type: 'message', content: [
    { type: 'output_text', text: 'VISUEL RESEARCH: Gobs er Victor Gaardboe.' },
    { type: 'output_text', text: 'Kilde: officiel side.' },
  ] }] })).toBe('VISUEL RESEARCH: Gobs er Victor Gaardboe. Kilde: officiel side.');
});
it('bounds source reads, deduplicates image URLs, retains unknown rights', async () => {
  mockRead('<meta property="og:image" content="https://press.example.org/photo.jpg">');
  const result = await inspectImageGenPressSources(Array.from({ length: 8 }, (_, i) => `https://press.example.org/page-${i}`));
  expect(reader).toHaveBeenCalledTimes(5); expect(result.pagesRead).toBe(4);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({ rightsStatus: 'unknown', credit: null, originalUrl: 'https://press.example.org/photo.jpg' });
});
it('preserves partial research when a source is inaccessible', async () => {
  mockRead('<meta property="og:image" content="https://press.example.org/photo.jpg">'); reader.mockRejectedValueOnce(new Error('blocked'));
  const result = await inspectImageGenPressSources(['https://press.example.org/a', 'https://press.example.org/b']);
  expect(result.pagesAttempted).toBe(2); expect(result.pagesRead).toBe(1); expect(result.candidates).toHaveLength(1);
});
it('finds responsive WordPress originals with their own caption; archives and schema homepages are not files', async () => {
  const html = `<div class="wp-caption"><a href="/photo.jpg.zip"><img src="data:image/svg+xml,placeholder" data-src="/photo-300.jpg" data-srcset="/photo-300.jpg 300w, /photo.jpg 1200w"></a><p class="wp-caption-text">Kontrapunkt. Foto: Daniel Rasmussen</p></div>
    <script type="application/ld+json">{"image":{"@id":"https://museum.dk/#/logo/image/"}}</script>`;
  const parsed = extractPressCandidates(html, 'https://museum.dk/press');
  expect(parsed.candidates[0]).toMatchObject({ url: 'https://museum.dk/photo.jpg', credit: 'Daniel Rasmussen' });
  expect(parsed.skipped[0].reason).toBe('archive_or_document_not_raster');
  mockRead(html); reader.mockImplementation(async (url, kind) => ({ bytes: kind === 'html' || url === 'https://museum.dk/' ? Buffer.from(html) : photo,
    finalUrl: url, contentType: kind === 'html' ? 'text/html' : 'image/jpeg', status: 200 }));
  const result = await inspectImageGenPressSources(['https://museum.dk/press']);
  expect(result.candidates).toHaveLength(1); expect(result.candidates[0].validation).toBe('decoded');
  expect(result.diagnostics[0].images).toContainEqual(expect.objectContaining({ url: 'https://museum.dk/', accepted: false, reason: 'press_image_decode_or_mime_invalid' }));
});
it.each(['empty', 'html', 'truncated', 'mime'])('rejects %s masquerading as a valid raster', async kind => {
  const bytes = kind === 'empty' ? Buffer.alloc(0) : kind === 'html' ? Buffer.from('<html>Please log in</html>') : kind === 'truncated' ? photo.subarray(0, photo.length - 100) : photo;
  await expect(validatePressRaster({ bytes, finalUrl: 'https://museum.dk/fake.jpg', contentType: kind === 'mime' ? 'image/png' : 'image/jpeg', status: 200 })).rejects.toThrow();
});
it('does not borrow a photographer from an unrelated image or footer, and reports no usable images', async () => {
  const parsed = extractPressCandidates('<img data-src="/one.jpg"><figure><img src="/two.jpg"><figcaption>Foto: Specific Photographer</figcaption></figure><footer>Foto: Wrong</footer>', 'https://museum.dk/press');
  expect(parsed.candidates[0].credit).toBeNull(); expect(parsed.candidates[1].credit).toBe('Specific Photographer');
  mockRead('<meta property="og:image" content="/home">'); photo = Buffer.from('blocked');
  expect(await inspectImageGenPressSources(['https://museum.dk/press'])).toMatchObject({ pagesRead: 1, usableImagesFound: 0, outcome: 'no_usable_images' });
});
