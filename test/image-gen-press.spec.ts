import { beforeEach, expect, it, vi } from 'vitest';
const reader = vi.hoisted(() => vi.fn());
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: reader }));
import { imageGenSearchSources, inspectImageGenPressSources } from '@/lib/image-gen/press';
beforeEach(() => reader.mockReset());
it('only consumes real search provenance, never model prose URLs', () => {
  expect(imageGenSearchSources({ output: [{ type: 'message', content: [{ text: 'https://fabricated.test/image.jpg',
    annotations: [{ type: 'url_citation', url: 'https://press.example.org/page' }] }] },
    { type: 'web_search_call', action: { sources: [{ url: 'https://127.0.0.1/private' }, { url: 'https://press.example.org/page' }] } }] }))
    .toEqual(['https://press.example.org/page']);
});
it('bounds source reads, deduplicates image URLs, retains unknown rights', async () => {
  reader.mockResolvedValue(Buffer.from('<meta property="og:image" content="https://press.example.org/photo.jpg">'));
  const result = await inspectImageGenPressSources(Array.from({ length: 8 }, (_, i) => `https://press.example.org/page-${i}`));
  expect(reader).toHaveBeenCalledTimes(4); expect(result.pagesRead).toBe(4);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({ rightsStatus: 'unknown', credit: null, originalUrl: 'https://press.example.org/photo.jpg' });
});
it('preserves partial research when a source is inaccessible', async () => {
  reader.mockRejectedValueOnce(new Error('blocked')).mockResolvedValueOnce(Buffer.from('<meta property="og:image" content="https://press.example.org/photo.jpg">'));
  const result = await inspectImageGenPressSources(['https://press.example.org/a', 'https://press.example.org/b']);
  expect(result.pagesAttempted).toBe(2); expect(result.pagesRead).toBe(1); expect(result.candidates).toHaveLength(1);
});
