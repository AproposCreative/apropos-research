import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ rows: new Map<string, any>(), read: vi.fn(), patch: vi.fn(), publish: vi.fn(), asset: vi.fn(), receipt: vi.fn(), clean: vi.fn(), lease: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: (id: string) => ({
  get: async () => ({ data: () => f.rows.get(id) }), update: async (data: any) => { f.rows.set(id, { ...f.rows.get(id), ...data }); },
  set: async (data: any) => { f.rows.set(id, { ...f.rows.get(id), ...data }); },
}) }) }) }));
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_ARTICLES_COLLECTION_ID: 'b'.repeat(24), WEBFLOW_CMS_LOCALE_DK: 'c'.repeat(24) } }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: f.read }));
vi.mock('@/lib/webflow/locale-items', () => ({ patchArticleFieldDataForLocale: f.patch, publishArticleItemForLocale: f.publish }));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({ acquireCmsWriteLease: f.lease }));
vi.mock('@/lib/images/text-free', () => ({ ensureTextFreeImage: f.clean, getTextFreeReceipt: f.receipt, readEditorialImage: f.asset, readTextFreeAsset: f.asset, imageByteHash: () => 'd'.repeat(64) }));
import { cleanPublishedCover, publishedCoverBaseline } from '@/lib/liv/published-cover-cleanup';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const itemId = 'a'.repeat(24), revisionId = 'e'.repeat(64);
let staged: Record<string, any>, live: Record<string, any>;
beforeEach(() => {
  vi.clearAllMocks(); f.rows.clear();
  staged = { name: 'Reacher', slug: 'reacher', content: '<p>Original review</p>', 'meta-description': 'Keep SEO', 'foto-credit': 'Prime Video', thumb: { url: 'https://press.test/old.jpg' } };
  live = structuredClone(staged);
  f.rows.set(revisionId, { receiptId: 'f'.repeat(64), status: 'prepared', input: { itemId, expectedCmsHash: cmsFieldHash(staged), credit: 'Prime Video', alt: 'Alan Ritchson som Reacher.' } });
  f.read.mockImplementation(async (path: string) => ({ id: itemId, cmsLocaleId: 'c'.repeat(24), isDraft: false, lastPublished: '2026-09-20T20:00:00Z', fieldData: structuredClone(path.includes('/live?') ? live : staged) }));
  f.patch.mockImplementation(async (_item, fields) => { staged = { ...staged, ...fields }; });
  f.publish.mockImplementation(async () => { live = structuredClone(staged); });
  f.asset.mockResolvedValue(Buffer.from('verified clean pixels'));
  f.receipt.mockResolvedValue({ image: { url: 'https://images.test/clean.webp', width: 1536, height: 864 } });
  f.lease.mockResolvedValue({ assertOwned: vi.fn(), release: vi.fn() });
});
it('updates and publishes only cover/mobile/credit, preserves body/SEO and reconciles repeat calls', async () => {
  const result = await cleanPublishedCover({ action: 'apply', itemId, revisionId });
  expect(result).toMatchObject({ status: 'published', publicationVerified: true });
  expect(Object.keys(f.patch.mock.calls[0][1]).sort()).toEqual(['foto-credit', 'mobile-image', 'thumb']);
  expect(live.content).toBe('<p>Original review</p>'); expect(live['meta-description']).toBe('Keep SEO');
  await cleanPublishedCover({ action: 'apply', itemId, revisionId });
  expect(f.patch).toHaveBeenCalledOnce(); expect(f.publish).toHaveBeenCalledOnce();
});
it('does not publish another editors staged changes', async () => {
  staged.content = 'Unpublished edits';
  await expect(publishedCoverBaseline(itemId)).rejects.toThrow('unpublished_changes');
  await expect(cleanPublishedCover({ action: 'apply', itemId, revisionId })).rejects.toThrow('article_changed');
  expect(f.patch).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
});
it('does not retry an ambiguous publish, but can reconcile a successful upstream write', async () => {
  f.publish.mockImplementationOnce(async () => { live = structuredClone(staged); throw new Error('connection lost'); });
  await expect(cleanPublishedCover({ action: 'apply', itemId, revisionId })).rejects.toThrow('connection lost');
  expect(await cleanPublishedCover({ action: 'apply', itemId, revisionId })).toMatchObject({ publicationVerified: true });
  expect(f.publish).toHaveBeenCalledOnce();
});
it('blocks a mismatch in uploaded bytes and retains write history', async () => {
  f.asset.mockResolvedValueOnce(Buffer.from('verified clean pixels')).mockResolvedValue(Buffer.from('wrong pixels'));
  await expect(cleanPublishedCover({ action: 'apply', itemId, revisionId })).rejects.toThrow('readback_mismatch');
  expect(f.publish).not.toHaveBeenCalled(); expect(f.rows.get(revisionId).patchStarted).toBe(true);
});
it('rejects unrelated edits during cover patch rather than publishing them', async () => {
  f.patch.mockImplementationOnce(async (_id, fields) => { staged = { ...staged, ...fields, content: 'Changed by another editor' }; });
  await expect(cleanPublishedCover({ action: 'apply', itemId, revisionId })).rejects.toThrow('other_fields_changed');
  expect(f.publish).not.toHaveBeenCalled();
});
it('does not spend on a malformed source', async () => {
  await expect(cleanPublishedCover({ action: 'prepare', itemId, sourceBase64: 'bad' })).rejects.toThrow('invalid');
  expect(f.clean).not.toHaveBeenCalled();
});
