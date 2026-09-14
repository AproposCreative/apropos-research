import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ state: vi.fn(), payload: vi.fn(), cms: vi.fn() }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: io.state, readDeliveryPayload: io.payload }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: io.cms }));
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_CMS_LOCALE_DK: 'locale' } }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ articlesCollectionId: 'collection' }) }));
import { readLivCoverBaseline } from '@/lib/liv/cover-baseline';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const id = 'a'.repeat(24), expected = { title: 'Article title', slug: 'article', content: 'Private body' };
let state: any, cms: any;
beforeEach(() => {
  vi.clearAllMocks();
  state = { entries: [{ itemId: id, scheduledDay: '2026-09-15', state: 'ready', payloadHash: cmsFieldHash(expected) }], slots: {} };
  cms = { id, cmsLocaleId: 'locale', isDraft: true, isArchived: false, lastPublished: null,
    fieldData: { name: expected.title, slug: expected.slug, content: expected.content } };
  io.state.mockImplementation(async () => state); io.cms.mockImplementation(async () => cms); io.payload.mockResolvedValue(expected);
});
it('returns only identity, day, title and exact hashes without requiring SEO fields', async () => {
  const before = JSON.stringify({ state, cms });
  expect(await readLivCoverBaseline(id)).toEqual({ itemId: id, dayKey: '2026-09-15', title: expected.title,
    expectedPayloadHash: cmsFieldHash(expected), expectedCmsHash: cmsFieldHash(cms.fieldData) });
  expect(JSON.stringify({ state, cms })).toBe(before);
});
it.each(['selected', 'published', 'rejected'])('rejects %s stories before reading CMS', async status => {
  state.entries[0].state = status;
  await expect(readLivCoverBaseline(id)).rejects.toThrow('not_ready'); expect(io.cms).not.toHaveBeenCalled();
});
it('rejects active holds and changed payloads', async () => {
  state.coverRevision = { itemId: id };
  await expect(readLivCoverBaseline(id)).rejects.toThrow('not_ready');
  delete state.coverRevision; state.entries[0].payloadHash = 'changed';
  await expect(readLivCoverBaseline(id)).rejects.toThrow('payload_changed');
  expect(io.cms).not.toHaveBeenCalled();
});
it.each([{ lastPublished: '2026-09-14' }, { cmsLocaleId: 'other' }, { isDraft: false }])('rejects wrong CMS state %j', async patch => {
  Object.assign(cms, patch); await expect(readLivCoverBaseline(id)).rejects.toThrow('not_unpublished_draft');
});
