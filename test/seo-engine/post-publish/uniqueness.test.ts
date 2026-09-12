import { beforeEach, expect, it, vi } from 'vitest';
const page = vi.hoisted(() => vi.fn());
vi.mock('@/lib/seo-engine/post-publish/cms', () => ({ listPublishedArticlePage: page }));
vi.mock('@/lib/seo-engine/webflow-adapter', () => ({ getCmsSeoSlugs: () => ({ seoTitle: 'seo-title', metaDescription: 'meta-description' }) }));
import { checkLiveMetadataDuplicates } from '../../../lib/seo-engine/post-publish/uniqueness';
const target = { itemId: 'one', locale: 'da' as const, metadata: { seoTitle: 'Same title', metaDescription: 'Description' } };
beforeEach(() => { page.mockReset(); });
it('finds a duplicate on a later page', async () => {
  page.mockResolvedValueOnce({ items: [{ id: 'three', lastPublished: '2026-09-12', fieldData: { 'seo-title': 'Other' } }], total: 2 })
    .mockResolvedValueOnce({ items: [{ id: 'two', lastPublished: '2026-09-12', fieldData: { 'seo-title': 'Same title' } }], total: 2 });
  expect((await checkLiveMetadataDuplicates(target)).seoTitle).toEqual(['two']);
  expect(page).toHaveBeenNthCalledWith(2, 'da', 1, 100);
});
it('never treats a failed traversal as evidence of uniqueness', async () => {
  page.mockRejectedValue(new Error('Webflow timeout'));
  await expect(checkLiveMetadataDuplicates(target)).rejects.toThrow('Webflow timeout');
});
it('rejects a missing page before the reported total', async () => {
  page.mockResolvedValue({ items: [], total: 30 });
  await expect(checkLiveMetadataDuplicates(target)).rejects.toThrow('incomplete_page');
});
