import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), enqueue: vi.fn() }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: mocks.inspect }));
vi.mock('@/lib/liv/delivery-store', () => ({ enqueueReadyArticle: mocks.enqueue }));
import { admitPreparedArticle, type PreparationProof } from '@/lib/liv/prepared-admission';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import type { WebflowArticleFields } from '@/lib/webflow/types';
const expected = { title: 'Kultur', slug: 'kultur', content: 'Tekst' } as WebflowArticleFields;
const proof: PreparationProof = { expected, hash: cmsFieldHash(expected as unknown as Record<string, unknown>), editorialPassed: true, structurePassed: true };
const entry = { itemId: 'a'.repeat(24), title: 'Kultur', slug: 'kultur', kind: 'scheduled' as const,
  scheduledDay: '2026-09-11', expiresDay: '2026-09-11' };
beforeEach(() => { vi.resetAllMocks(); mocks.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: true,
  checks: [{ id: 'images', ok: true }] }); });
it('enqueues only after fresh CMS and media verification', async () => {
  await admitPreparedArticle(entry, proof);
  expect(mocks.inspect).toHaveBeenCalledWith({ itemId: entry.itemId, expected });
  expect(mocks.enqueue).toHaveBeenCalledWith(entry, expected);
});
it('does not trust a changed saved proof', async () => {
  await expect(admitPreparedArticle(entry, { ...proof, expected: { ...expected, content: 'changed' } })).rejects.toThrow('proof_invalid');
  expect(mocks.inspect).not.toHaveBeenCalled();
});
it.each([{ publicationReady: false }, { draftConfirmed: false }, { checks: [] },
  { checks: [{ id: 'images', ok: false }] }])('rejects incomplete CMS proof %o', async override => {
  mocks.inspect.mockResolvedValue({ ...(await mocks.inspect()), ...override });
  await expect(admitPreparedArticle(entry, proof)).rejects.toThrow('not_ready');
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
