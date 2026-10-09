import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, clean: vi.fn(), optimize: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/webflow/text-free-images', () => ({ enforceTextFreeArticleImages: (...args: unknown[]) => state.clean(...args) }));
vi.mock('@/lib/webflow/thumb-image-optimizer', () => ({ maybeOptimizeThumbImageForFieldData: state.optimize }));
vi.mock('@/lib/webflow/mobile-image-optimizer', () => ({ maybeOptimizeMobileImageForFieldData: state.optimize }));
vi.mock('@/lib/webflow/content-image-optimizer', () => ({ maybeOptimizeContentImagesForFieldData: state.optimize }));
import { lockProvidedAsset, containsLockedProvidedAsset } from '@/lib/editorial/provided-assets';
import { autoOptimizeArticleFieldData, compressArticleFieldData } from '@/lib/webflow/article-image-auto-optimize';
const url = 'https://cdn.test/my-selected-cover.png';
beforeEach(() => { vi.clearAllMocks(); state.db = memoryFirestore().db; });
it('protects exactly selected media from cropping/cleanup, including later forced webhooks', async () => {
  const fields = { thumb: { url }, 'mobile-image': { url }, content: '<p>Uændret</p>' };
  const before = JSON.stringify(fields);
  await lockProvidedAsset('owner', 'a'.repeat(64), url, 'b'.repeat(64));
  expect(await containsLockedProvidedAsset(fields)).toBe(true);
  expect(await containsLockedProvidedAsset({ thumb: { url: 'https://cdn.test/other.png' } })).toBe(false);
  await autoOptimizeArticleFieldData({ fieldData: fields, force: true });
  expect(JSON.stringify(fields)).toBe(before); expect(state.clean).not.toHaveBeenCalled(); expect(state.optimize).not.toHaveBeenCalled();
});
it('internal exact-image saves do not depend on paid cleanup or a registry read', async () => {
  state.db = null;
  await autoOptimizeArticleFieldData({ fieldData: { thumb: { url } }, preserveProvidedImages: true });
  expect(state.clean).not.toHaveBeenCalled(); expect(state.optimize).not.toHaveBeenCalled();
});
it('published compression never calls the paid editorial image check', async () => {
  state.optimize.mockResolvedValue({imagesOptimized:1,imagesFailed:0});
  await compressArticleFieldData({fieldData:{thumb:{url}}});
  expect(state.clean).not.toHaveBeenCalled();expect(state.optimize).toHaveBeenCalled();
});
it('app preparation retains its editorial check',async()=>{
  state.optimize.mockResolvedValue({imagesOptimized:0,imagesFailed:0});
  await autoOptimizeArticleFieldData({fieldData:{thumb:{url}}});
  expect(state.clean).toHaveBeenCalledOnce();
});
