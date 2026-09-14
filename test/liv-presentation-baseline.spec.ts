import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ state: vi.fn(), payload: vi.fn(), cms: vi.fn() }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: io.state, readDeliveryPayload: io.payload }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: io.cms }));
vi.mock('@/lib/seo-engine/opportunity-engine/locale', () => ({ cmsLocaleIdFor: () => 'locale' }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ articlesCollectionId: 'collection' }) }));
import { readLivPresentationBaseline } from '@/lib/liv/presentation-baseline';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const id = 'a'.repeat(24);
const payload = { title: 'Original title', slug: 'original', content: 'private body' };
const fields = { name: 'Current CMS title', slug: 'original', 'seo-title': 'Current SEO title',
  'meta-description': 'Current description', content: 'private body' };
let state: any, cms: any;
beforeEach(() => {
  vi.clearAllMocks();
  state = { entries: [{ itemId: id, state: 'ready', payloadHash: cmsFieldHash(payload) }], slots: {} };
  cms = { id, cmsLocaleId: 'locale', isDraft: true, isArchived: false, lastPublished: null, fieldData: fields };
  io.state.mockImplementation(async () => state);
  io.payload.mockResolvedValue(payload);
  io.cms.mockImplementation(async () => cms);
});
it('returns only editable fields and exact server hashes without mutating state', async () => {
  const before = JSON.stringify({ state, cms });
  expect(await readLivPresentationBaseline(id)).toEqual({ itemId: id, expectedPayloadHash: cmsFieldHash(payload),
    expectedCmsHash: cmsFieldHash(fields), title: fields.name, seoTitle: fields['seo-title'], seoDescription: fields['meta-description'] });
  expect(JSON.stringify({ state, cms })).toBe(before);
  expect(io.cms).toHaveBeenCalledWith(`collections/collection/items/${id}?cmsLocaleId=locale`);
});
it.each(['selected', 'published', 'expired'])('rejects %s before CMS access', async status => {
  state.entries[0].state = status;
  await expect(readLivPresentationBaseline(id)).rejects.toThrow('not_ready');
  expect(io.cms).not.toHaveBeenCalled();
});
it('rejects rejected and currently locked stories', async () => {
  state.entries[0].decision = 'rejected';
  await expect(readLivPresentationBaseline(id)).rejects.toThrow('not_ready');
  delete state.entries[0].decision;
  state.slots.today = { itemId: id };
  await expect(readLivPresentationBaseline(id)).rejects.toThrow('not_ready');
  state.slots = {}; state.coverRevision = { id: 'pending' };
  await expect(readLivPresentationBaseline(id)).rejects.toThrow('not_ready');
  expect(io.cms).not.toHaveBeenCalled();
});
it('rejects mismatched payload', async () => {
  state.entries[0].payloadHash = 'b'.repeat(64);
  await expect(readLivPresentationBaseline(id)).rejects.toThrow('payload_changed');
  expect(io.cms).not.toHaveBeenCalled();
});
it.each([{ lastPublished: '2026-09-14' }, { isDraft: false }, { isArchived: true }, { cmsLocaleId: 'other' }, { id: 'other' }])('rejects nonmatching or published CMS item %j', async patch => {
  Object.assign(cms, patch);
  await expect(readLivPresentationBaseline(id)).rejects.toThrow('not_unpublished_draft');
});
it('rejects malformed item IDs before reads', async () => {
  await expect(readLivPresentationBaseline('../other')).rejects.toThrow('invalid');
  expect(io.state).not.toHaveBeenCalled();
});
