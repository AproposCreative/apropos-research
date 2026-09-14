import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ saved: null as any, rows: [] as any[], baseline: vi.fn(), payload: vi.fn(), prepare: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({
  doc: () => ({ get: async () => ({ data: () => io.saved }) }),
  where: () => ({ limit: () => ({ get: async () => ({ docs: io.rows.map(row => ({ data: () => row })) }) }) }),
}) }) }));
vi.mock('@/lib/liv/shortening-baseline', () => ({ readLivShorteningBaseline: io.baseline }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryPayload: io.payload }));
vi.mock('@/lib/liv/shortening-proposal', async original => ({ ...await original<typeof import('@/lib/liv/shortening-proposal')>(), prepareLivShorteningProposal: io.prepare }));
import { requestLivShortening } from '@/lib/liv/request-shortening';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const expected = { title: 'Article', content: '<p>Canonical text</p>' };
const input = { itemId: 'a'.repeat(24), requestId: 'shortening-0001', expectedPayloadHash: cmsFieldHash(expected), expectedCmsHash: 'c'.repeat(64), targetWords: 500 };
const article = { title: 'Article', content: expected.content, rawResponse: 'Paid original' };
beforeEach(() => {
  vi.clearAllMocks(); io.saved = null;
  io.rows = [{ status: 'draft', articleCheckpoint: article, preparationProof: { editorialPassed: true, structurePassed: true, hash: input.expectedPayloadHash, expected } }];
  io.baseline.mockResolvedValue({ expectedPayloadHash: input.expectedPayloadHash, expectedCmsHash: input.expectedCmsHash, minTargetWords: 450, maxTargetWords: 599 });
  io.payload.mockResolvedValue(expected); io.prepare.mockResolvedValue({ status: 'preview' });
});
it('uses only the server checkpoint after version and proof checks', async () => {
  expect(await requestLivShortening(input)).toEqual({ status: 'preview' });
  expect(io.prepare).toHaveBeenCalledWith(input, article);
});
it('replays paid proposals without requiring the article to remain ready', async () => {
  io.saved = { input, article, proposal: { status: 'preview' } };
  await requestLivShortening(input); expect(io.baseline).not.toHaveBeenCalled();
  expect(io.prepare).toHaveBeenCalledWith(input, article);
});
it('never regenerates an ambiguous prior attempt', async () => {
  io.saved = { input, article, status: 'generating' };
  await expect(requestLivShortening(input)).rejects.toThrow('requires_reconciliation'); expect(io.prepare).not.toHaveBeenCalled();
});
it('rechecks queue state after a non-started budget denial', async () => {
  io.saved = { input, article, status: 'not_started', providerAttempted: false, notStartedReason: 'cost_denied' };
  io.baseline.mockRejectedValue(new Error('liv_shortening_not_ready'));
  await expect(requestLivShortening(input)).rejects.toThrow('not_ready'); expect(io.prepare).not.toHaveBeenCalled();
});
it('rejects a different request under the same saved identity', async () => {
  io.saved = { input: { ...input, targetWords: 490 }, article, proposal: {} };
  await expect(requestLivShortening(input)).rejects.toThrow('request_conflict'); expect(io.prepare).not.toHaveBeenCalled();
});
it('rejects stale CMS versions before generation', async () => {
  io.baseline.mockResolvedValue({ expectedPayloadHash: input.expectedPayloadHash, expectedCmsHash: 'changed' });
  await expect(requestLivShortening(input)).rejects.toThrow('version_changed'); expect(io.prepare).not.toHaveBeenCalled();
});
it.each(['missing', 'unverified', 'changed', 'conflicting'])('rejects %s checkpoint', async kind => {
  if (kind === 'missing') io.rows = [];
  if (kind === 'unverified') io.rows[0].preparationProof.editorialPassed = false;
  if (kind === 'changed') io.rows[0].articleCheckpoint = { ...article, content: '<p>Changed</p>' };
  if (kind === 'conflicting') io.rows.push({ ...io.rows[0], articleCheckpoint: { ...article, title: 'Different' } });
  await expect(requestLivShortening(input)).rejects.toThrow('liv_shortening_checkpoint_'); expect(io.prepare).not.toHaveBeenCalled();
});
