import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: vi.fn() }));
import { stagedSaveCandidates } from '@/lib/articles/find-staged-save';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
const id = '0123456789abcdef01234567';
const localeId = '1123456789abcdef01234567';
const collectionId = '2123456789abcdef01234567';
const expected = normalizeArticlePayload({ title: 'Kultur', slug: 'kultur', content: '<p>Ny tekst.</p>' });
const item = { id, cmsLocaleId: localeId, isDraft: true, isArchived: false, fieldData: { name: expected.title, slug: expected.slug, content: expected.content } };
it('requires matching locale, draft state, body and identity fields', async () => {
  const read = vi.fn().mockResolvedValue({ items: [item, { ...item, id: localeId, fieldData: { ...item.fieldData, content: '<p>Gammel tekst.</p>' } }, { ...item, id: collectionId, isDraft: false }] });
  expect(await stagedSaveCandidates(expected, { read, collectionId, localeId })).toEqual([id]);
});
it('records all existing IDs, not just articles whose content currently matches', async () => {
  const read = vi.fn().mockResolvedValue({ items: [{ ...item, fieldData: { name: 'Anden artikel' } }] });
  expect(await stagedSaveCandidates(expected, { read, collectionId, localeId }, true)).toEqual([id]);
});
it('does not treat a failed or malformed listing as absence', async () => {
  const read = vi.fn().mockResolvedValue({ error: 'missing' });
  await expect(stagedSaveCandidates(expected, { read, collectionId, localeId })).rejects.toThrow('cms_listing_invalid');
});
it('rejects a truncated 5000-item scan', async () => {
  const read = vi.fn().mockResolvedValue({ items: Array.from({length:100}, () => item) });
  await expect(stagedSaveCandidates(expected, { read, collectionId, localeId })).rejects.toThrow('cms_listing_incomplete');
  expect(read).toHaveBeenCalledTimes(50);
});
it('finds the same item after a lost response despite byte-identical Webflow rehosting', async () => {
  const content = '<p>Ny tekst.</p><img src="https://cdn.prod.website-files.com/site/one.png" alt="A">';
  const read = vi.fn().mockResolvedValue({ items: [{ ...item, fieldData: { ...item.fieldData, content: content.replace('site/one.png','collection/copy.png') } }] });
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).png().toBuffer();
  const readImage = vi.fn().mockResolvedValue(bytes);
  expect(await stagedSaveCandidates({ ...expected, content }, { collectionId, localeId, read, readImage })).toEqual([id]);
  expect(readImage).toHaveBeenCalledTimes(2);
});
