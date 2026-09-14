import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ state: vi.fn(), payload: vi.fn(), cms: vi.fn() }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: io.state, readDeliveryPayload: io.payload }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: io.cms }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/seo-engine/opportunity-engine/locale', () => ({ cmsLocaleIdFor: () => 'locale' }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ articlesCollectionId: 'collection' }) }));
import { readLivShorteningBaseline } from '@/lib/liv/shortening-baseline';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const id = 'a'.repeat(24);
let state: any, cms: any, expected: any;
beforeEach(() => {
  vi.clearAllMocks();
  expected = { title: 'Article title', slug: 'article', content: `<p>${'kultur '.repeat(200)}</p>`.repeat(3) };
  state = { entries: [{ itemId: id, scheduledDay: '2026-09-15', state: 'ready', payloadHash: cmsFieldHash(expected) }], slots: {} };
  cms = { id, cmsLocaleId: 'locale', isDraft: true, isArchived: false, lastPublished: null,
    fieldData: { name: expected.title, slug: expected.slug, content: expected.content } };
  io.state.mockImplementation(async () => state); io.cms.mockImplementation(async () => cms); io.payload.mockImplementation(async () => expected);
});
it('returns counts and version tokens without private prose or approval', async () => {
  const before = JSON.stringify({ state, cms, expected });
  expect(await readLivShorteningBaseline(id)).toEqual({ itemId: id, title: expected.title, dayKey: '2026-09-15',
    expectedPayloadHash: cmsFieldHash(expected), expectedCmsHash: cmsFieldHash(cms.fieldData),
    wordCount: 600, minTargetWords: 450, maxTargetWords: 599, suggestedTargetWords: 500, publicationReady: false });
  expect(JSON.stringify({ state, cms, expected })).toBe(before);
});
it.each(['selected', 'published', 'rejected'])('rejects %s queue state before CMS read', async status => {
  state.entries[0].state = status;
  await expect(readLivShorteningBaseline(id)).rejects.toThrow('not_ready');
  expect(io.cms).not.toHaveBeenCalled();
});
it('rejects revision holds and scheduled selection', async () => {
  state.coverRevision = { itemId: id };
  await expect(readLivShorteningBaseline(id)).rejects.toThrow('not_ready');
  delete state.coverRevision; state.slots['2026-09-15'] = { itemId: 'other' };
  await expect(readLivShorteningBaseline(id)).rejects.toThrow('not_ready');
});
it('rejects stale payload and changed CMS body', async () => {
  state.entries[0].payloadHash = 'changed';
  await expect(readLivShorteningBaseline(id)).rejects.toThrow('payload_changed');
  state.entries[0].payloadHash = cmsFieldHash(expected); cms.fieldData.content += '<p>New fact</p>';
  await expect(readLivShorteningBaseline(id)).rejects.toThrow('draft_changed');
});
it.each([{ lastPublished: '2026-09-14' }, { cmsLocaleId: 'other' }, { isDraft: false }, { isArchived: true }])('rejects CMS state %j', async patch => {
  Object.assign(cms, patch); await expect(readLivShorteningBaseline(id)).rejects.toThrow('not_unpublished_draft');
});
it.each([449, 450])('does not offer shortening below the minimum at %i words', async n => {
  expected.content = `<p>${'kultur '.repeat(n - 2)}</p><p>Ét</p><p>To</p>`; cms.fieldData.content = expected.content;
  state.entries[0].payloadHash = cmsFieldHash(expected);
  await expect(readLivShorteningBaseline(id)).rejects.toThrow('not_shortenable');
});
it.each(['<p>' + 'kultur '.repeat(600) + '</p>', ('<blockquote><p>' + 'kultur '.repeat(200) + '</p></blockquote>').repeat(3)])('does not offer an uneditable structure', content => {
  expected.content = content; cms.fieldData.content = content; state.entries[0].payloadHash = cmsFieldHash(expected);
  return expect(readLivShorteningBaseline(id)).rejects.toThrow('not_shortenable');
});
