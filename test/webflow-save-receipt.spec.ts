import { expect, it, vi } from 'vitest';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: vi.fn() }));
import { inspectArticleSave } from '@/lib/articles/save-receipt';

const id = '0123456789abcdef01234567';
const localeId = '1123456789abcdef01234567';
const collectionId = '2123456789abcdef01234567';
const expected = normalizeArticlePayload({ title: 'Rotten', slug: 'rotten', content: '<p>Fortolkning.</p>' });
const stored = { id, cmsLocaleId: localeId, isArchived: false, isDraft: true,
  fieldData: { name: 'Rotten', slug: 'rotten', content: '<p>Fortolkning.</p>' } };
const run = (item: unknown) => {
  const read = vi.fn().mockResolvedValue(item);
  return { read, result: inspectArticleSave({ articleId: id, expected }, { collectionId, localeId, read }) };
};
it('reads exactly the stored Danish item and returns draft status', async () => {
  const { read, result } = run(stored);
  expect(await result).toEqual({ saveState: 'draft', saveVerified: true, cmsLocaleId: localeId });
  expect(read).toHaveBeenCalledWith(`collections/${collectionId}/items/${id}?cmsLocaleId=${localeId}`);
});
it('never treats old lastPublished metadata as proof of a newly published revision', async () => {
  expect(await run({ ...stored, isDraft: false, lastPublished: '2026-09-09T10:00:00Z' }).result)
    .toMatchObject({ saveState: 'staged' });
});
it.each([
  { ...stored, id: localeId }, { ...stored, cmsLocaleId: id },
  { ...stored, isArchived: true }, { ...stored, isDraft: undefined },
  { ...stored, fieldData: { ...stored.fieldData, name: 'Anden artikel' } },
  { ...stored, fieldData: { ...stored.fieldData, content: '' } },
])('rejects mismatched or empty CMS data', async item => {
  await expect(run(item).result).rejects.toThrow('webflow_save_readback_mismatch');
});
it('rejects unsafe identifiers before reading', async () => {
  const read = vi.fn();
  await expect(inspectArticleSave({ articleId: '../invalid', expected }, { collectionId, localeId, read }))
    .rejects.toThrow('webflow_save_invalid_identity');
  expect(read).not.toHaveBeenCalled();
});
