import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), inspect: vi.fn(), seo: vi.fn() }));
vi.mock('@/lib/webflow-service', () => ({ publishArticleToWebflow: mocks.save }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/articles/save-receipt', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/articles/save-receipt')>(), inspectArticleSave: mocks.inspect,
}));
vi.mock('@/lib/seo-engine/after-publish', () => ({ maybeEnqueueSeoEngineAfterPublish: mocks.seo }));
import { publishArticleDraftToWebflow, publishCanonicalArticleToWebflow } from '@/lib/articles/publish';
const id = '0123456789abcdef01234567';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.save.mockResolvedValue(id);
  mocks.inspect.mockResolvedValue({ saveState: 'draft', saveVerified: true, cmsLocaleId: id });
});
it.each([publishCanonicalArticleToWebflow, publishArticleDraftToWebflow])('returns the same checked staged contract for both callers', async save => {
  const result = await save({ title: 'Kultur', content: '<p>En artikel.</p>', status: 'published', workflowState: 'published' });
  expect(result).toMatchObject({ articleId: id, publicationVerified: false,
    payload: { status: 'draft', workflowState: 'webflow_draft' }, receipt: { saveVerified: true } });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.inspect).toHaveBeenCalledTimes(1);
  expect(mocks.seo).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.inspect.mock.invocationCallOrder[0]);
  expect(mocks.inspect.mock.invocationCallOrder[0]).toBeLessThan(mocks.seo.mock.invocationCallOrder[0]);
});
it('retains an existing update ID if the write response is uncertain', async () => {
  mocks.save.mockRejectedValue(new Error('PRIVATE'));
  await expect(publishArticleDraftToWebflow({ title: 'Kultur', content: 'tekst', webflowId: id }))
    .rejects.toMatchObject({ articleId: id, message: 'webflow_save_unverified' });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.inspect).not.toHaveBeenCalled();
  expect(mocks.seo).not.toHaveBeenCalled();
});
it('does not enqueue SEO after a failed readback or recreate the item', async () => {
  mocks.inspect.mockRejectedValue(new Error('PRIVATE'));
  await expect(publishArticleDraftToWebflow({ title: 'Kultur', content: 'tekst' }))
    .rejects.toMatchObject({ articleId: id, message: 'webflow_save_unverified' });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.seo).not.toHaveBeenCalled();
});
it('does not lose a checked save if the optional SEO enqueue fails', async () => {
  mocks.seo.mockRejectedValue(new Error('PRIVATE'));
  await expect(publishArticleDraftToWebflow({ title: 'Kultur', content: 'tekst' }))
    .resolves.toMatchObject({ articleId: id, publicationVerified: false });
});
it('awaits the caller checkpoint before readback and retains the ID if it fails', async () => {
  const checkpoint = vi.fn().mockRejectedValue(new Error('checkpoint offline'));
  await expect(publishArticleDraftToWebflow({ title: 'Kultur', content: 'tekst' }, { onSaved: checkpoint }))
    .rejects.toMatchObject({ articleId: id, message: 'webflow_save_unverified' });
  expect(checkpoint).toHaveBeenCalledWith(id);
  expect(mocks.inspect).not.toHaveBeenCalled();
  expect(mocks.seo).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
it('does not accept a different returned item ID when updating', async () => {
  const existingId = '1123456789abcdef01234567';
  const checkpoint = vi.fn();
  await expect(publishArticleDraftToWebflow({ title: 'Kultur', content: 'tekst', webflowId: existingId }, { onSaved: checkpoint }))
    .rejects.toMatchObject({ articleId: existingId, message: 'webflow_save_unverified' });
  expect(checkpoint).not.toHaveBeenCalled();
  expect(mocks.inspect).not.toHaveBeenCalled();
});
it('checkpoints a successful write before performing readback', async () => {
  const checkpoint = vi.fn().mockResolvedValue(undefined);
  await publishArticleDraftToWebflow({ title: 'Kultur', content: 'tekst' }, { onSaved: checkpoint });
  expect(checkpoint).toHaveBeenCalledWith(id);
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(checkpoint.mock.invocationCallOrder[0]);
  expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(mocks.inspect.mock.invocationCallOrder[0]);
});
