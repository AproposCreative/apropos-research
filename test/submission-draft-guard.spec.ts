import { beforeEach, expect, it, vi } from 'vitest';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const state = vi.hoisted(() => ({ cms: {} as any }));
vi.mock('@/lib/editorial/submission-published-target', () => ({ readSubmissionCms: async () => state.cms }));
import { preservedDraftAdditions, inspectPreparedDraftBoundary, verifyPreservedDraftFields } from '@/lib/editorial/submission-draft-guard';
const base = { name: 'Old title', content: '<p>Old approved draft</p>', author: 'author', thumb: { url: 'https://image.test/old.jpg' },
  'unique-watch-now-title': null, 'watch-now-link': null, 'video-trailer': null };
const extras = { 'unique-watch-now-title': 'Netflix', 'watch-now-link': 'https://www.netflix.com/dk/title/81278442', 'video-trailer': { url: 'https://www.youtube.com/watch?v=ZHRR-1CKYIQ', html: '<iframe></iframe>' } };
beforeEach(() => { state.cms = { id: 'item', isDraft: true, lastPublished: null, fieldData: { ...base, ...extras } }; });
it('proves the complete old snapshot, preserves three additive fields and records a fresh boundary', async () => {
  expect(preservedDraftAdditions(base, cmsFieldHash(base))).toEqual({});
  expect(await inspectPreparedDraftBoundary({ itemId: 'item', proof: { fieldDataHash: cmsFieldHash(base) } }))
    .toMatchObject({ itemId: 'item', cmsHash: cmsFieldHash(state.cms.fieldData), preserved: extras });
  const { 'video-trailer': _trailer, ...withoutTrailer } = base;
  expect(preservedDraftAdditions({ ...withoutTrailer, 'video-trailer': extras['video-trailer'] }, cmsFieldHash(withoutTrailer)))
    .toEqual({ 'video-trailer': extras['video-trailer'] });
});
it('never excuses other concurrent edits or replaced nonempty optional fields', () => {
  for (const key of ['name', 'content', 'author', 'thumb', 'slug']) {
    expect(() => preservedDraftAdditions({ ...state.cms.fieldData, [key]: 'changed' }, cmsFieldHash(base))).toThrow('cms_conflict');
  }
  const prior = { ...base, 'watch-now-link': 'https://original.test' };
  expect(() => preservedDraftAdditions(state.cms.fieldData, cmsFieldHash(prior))).toThrow('cms_conflict');
});
it('never treats published, staged-live or previously published items as untouched private drafts', async () => {
  for (const patch of [{ isDraft: false }, { isDraft: true, lastPublished: '2026-10-12T10:00:00Z' }]) {
    Object.assign(state.cms, patch);
    await expect(inspectPreparedDraftBoundary({ itemId: 'item', proof: { fieldDataHash: cmsFieldHash(base) } })).rejects.toThrow('cms_conflict');
  }
});
it('verifies retained optional fields after write/readback, including timeout reconciliation', async () => {
  await verifyPreservedDraftFields('item', { preserved: extras });
  state.cms.fieldData['video-trailer'] = null;
  await expect(verifyPreservedDraftFields('item', { preserved: extras })).rejects.toThrow('cms_conflict');
});
