import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const page = vi.hoisted(() => vi.fn());
vi.mock('@/lib/seo-engine/post-publish/cms', () => ({ listPublishedArticlePage: page }));
vi.mock('@/lib/seo-engine/webflow-adapter', () => ({ getCmsSeoSlugs: () => ({ seoTitle: 'seo-title', metaDescription: 'meta-description' }) }));
import { checkLiveMetadataDuplicates, createMetadataReviewInventory, REVIEW_INVENTORY_MAX_AGE_MS } from '../../../lib/seo-engine/post-publish/uniqueness';
const target = { itemId: 'one', locale: 'da' as const, metadata: { seoTitle: 'Same title', metaDescription: 'Description' } };
beforeEach(() => { page.mockReset(); });
afterEach(() => { vi.useRealTimers(); });
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
const row = (id: string, title = 'Same title') => ({ id, lastPublished: '2026-09-12', fieldData: { 'seo-title': title } });
it('shares one complete locale inventory within a review request, excluding each target independently', async () => {
  page.mockResolvedValue({ items: [row('one'), row('two')], total: 2 });
  const review = createMetadataReviewInventory();
  const [a, b] = await Promise.all([review(target), review({ ...target, itemId: 'two' })]);
  expect(a.seoTitle).toEqual(['two']); expect(b.seoTitle).toEqual(['one']); expect(page).toHaveBeenCalledOnce();
  await createMetadataReviewInventory()(target); // another request never shares state
  expect(page).toHaveBeenCalledTimes(2);
  await checkLiveMetadataDuplicates(target); // write gate always re-reads
  expect(page).toHaveBeenCalledTimes(3);
});
it('separates languages and expires review inventories after one minute', async () => {
  vi.useFakeTimers();
  page.mockResolvedValue({ items: [row('two')], total: 1 });
  const review = createMetadataReviewInventory();
  await review(target); await review({ ...target, locale: 'en' });
  expect(page).toHaveBeenCalledTimes(2);
  await review(target); expect(page).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(REVIEW_INVENTORY_MAX_AGE_MS);
  await review(target); expect(page).toHaveBeenCalledTimes(3);
});
it('does not retain failed/partial inventory or return stale data on refresh failure', async () => {
  vi.useFakeTimers(); const review = createMetadataReviewInventory();
  page.mockResolvedValueOnce({ items: [row('two')], total: 2 }).mockRejectedValueOnce(Error('timeout'));
  await expect(review(target)).rejects.toThrow('timeout');
  page.mockResolvedValueOnce({ items: [], total: 0 });
  expect((await review(target)).seoTitle).toEqual([]); expect(page).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(REVIEW_INVENTORY_MAX_AGE_MS);
  page.mockRejectedValueOnce(Error('refresh failed'));
  await expect(review(target)).rejects.toThrow('refresh failed');
});
it.each(['total', 'duplicate', 'overflow'])('fails closed on inconsistent %s pagination', async scenario => {
  page.mockResolvedValueOnce({ items: [row('one')], total: 2 }).mockResolvedValueOnce({
    items: scenario === 'overflow' ? [row('two'), row('three')] : [row(scenario === 'duplicate' ? 'one' : 'two')],
    total: scenario === 'total' ? 3 : 2 });
  await expect(checkLiveMetadataDuplicates(target)).rejects.toThrow('seo_uniqueness_inventory_changed');
});
it('fresh write check detects another article created after advisory review', async () => {
  page.mockResolvedValueOnce({ items: [], total: 0 }).mockResolvedValueOnce({ items: [row('two')], total: 1 });
  expect((await createMetadataReviewInventory()(target)).seoTitle).toEqual([]);
  expect((await checkLiveMetadataDuplicates(target)).seoTitle).toEqual(['two']);
});
