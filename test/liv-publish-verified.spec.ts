import { expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
import { publishVerifiedLivArticle } from '@/lib/liv/publish-verified';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import type { WebflowArticleFields } from '@/lib/webflow/types';

const itemId = 'a'.repeat(24), collectionId = 'b'.repeat(24), localeId = 'c'.repeat(24);
function fixture() {
  const content = '<p>Første afsnit.</p><p>Andet afsnit med holdning.</p><figure><img src="https://example.com/one.webp"></figure><figure><img src="https://example.com/two.webp"></figure>';
  const expected = { title: 'En artikel', slug: 'en-artikel', content } as WebflowArticleFields;
  const fields = { name: expected.title, slug: expected.slug, content, 'ai-generated': true,
    thumb: { url: 'https://example.com/hero.webp' } };
  const staged = { id: itemId, cmsLocaleId: localeId, isDraft: true, isArchived: false, fieldData: fields };
  const live = { ...staged, isDraft: false, lastPublished: new Date().toISOString() };
  const inspect = vi.fn().mockResolvedValue({ itemId, localeId, draftConfirmed: true,
    publicationReady: true, fieldDataHash: cmsFieldHash(fields), checks: [{ id: 'all', ok: true }] });
  const read = vi.fn(async (path: string) => path.includes('/live?') ? live : staged);
  const publish = vi.fn().mockResolvedValue(undefined);
  const readPage = vi.fn().mockResolvedValue(Buffer.from(`<h1>En artikel</h1><img src="https://example.com/hero.webp">${content}`));
  return { expected, staged, live, inspect, read, publish, readPage,
    deps: { collectionId, localeId, inspect, read, publish, readPage, wait: vi.fn().mockResolvedValue(undefined) } };
}
it('publishes exactly the checked item and locale, then verifies live data and public HTML', async () => {
  const f = fixture();
  const result = await publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps);
  expect(result).toMatchObject({ publicationVerified: true, itemId, localeId,
    publicUrl: 'https://www.aproposmagazine.com/articles/en-artikel' });
  expect(f.publish).toHaveBeenCalledExactlyOnceWith(itemId, localeId);
  expect(f.inspect.mock.invocationCallOrder[0]).toBeLessThan(f.publish.mock.invocationCallOrder[0]);
  expect(f.publish.mock.invocationCallOrder[0]).toBeLessThan(f.readPage.mock.invocationCallOrder[0]);
  expect(f.read).toHaveBeenCalledWith(`collections/${collectionId}/items/${itemId}/live?cmsLocaleId=${localeId}`);
});
it.each([{ publicationReady: false }, { draftConfirmed: false }, { checks: [] },
  { checks: [{ id: 'bad', ok: false }] }, { localeId: 'd'.repeat(24) }])('does not publish with incomplete proof %o', async override => {
  const f = fixture();
  f.inspect.mockResolvedValue({ ...(await f.inspect()), ...override });
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('checks_failed');
  expect(f.publish).not.toHaveBeenCalled();
});
it('detects an edit between inspection and publication', async () => {
  const f = fixture(); f.staged.fieldData['ai-generated'] = false;
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('draft_changed');
  expect(f.publish).not.toHaveBeenCalled();
});
it.each(['identity', 'locale', 'draft', 'timestamp', 'revision'])('rejects incorrect live %s', async failure => {
  const f = fixture();
  if (failure === 'identity') f.live.id = 'd'.repeat(24);
  if (failure === 'locale') f.live.cmsLocaleId = 'd'.repeat(24);
  if (failure === 'draft') f.live.isDraft = true;
  if (failure === 'timestamp') f.live.lastPublished = '';
  if (failure === 'revision') f.live.fieldData = { ...f.live.fieldData, name: 'Gammel version' };
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('live_mismatch');
  expect(f.publish).toHaveBeenCalledTimes(1);
  expect(f.readPage).not.toHaveBeenCalled();
});
it.each(['<h1>Forkert artikel</h1>', '<h1>En artikel</h1><p>Gammel tekst</p>',
  '<h1>En artikel</h1><script>Første afsnit. Andet afsnit med holdning.</script>'])('does not accept a generic HTTP 200 or hidden body: %s', async html => {
  const f = fixture(); f.readPage.mockResolvedValue(Buffer.from(html));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('public_page_mismatch');
});
it('requires the public page to contain the CMS images', async () => {
  const f = fixture(); f.readPage.mockResolvedValue(Buffer.from('<h1>En artikel</h1><p>Første afsnit.</p><p>Andet afsnit med holdning.</p>'));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('public_images_missing');
});
it('does not repeat an uncertain external write', async () => {
  const f = fixture(); f.publish.mockRejectedValue(new Error('timeout'));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('timeout');
  expect(f.publish).toHaveBeenCalledTimes(1);
});
it('retries readback after 202 propagation without publishing twice', async () => {
  const f = fixture();
  f.read.mockResolvedValueOnce(f.staged).mockRejectedValueOnce(new Error('liv_cms_readback_http_404'));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).resolves.toMatchObject({ publicationVerified: true });
  expect(f.publish).toHaveBeenCalledTimes(1);
  expect(f.deps.wait).toHaveBeenCalledWith(500);
});
it('rejects malformed targets before any access', async () => {
  const f = fixture();
  await expect(publishVerifiedLivArticle({ itemId: '../bad', expected: f.expected }, f.deps)).rejects.toThrow('invalid_identity');
  expect(f.inspect).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
});
