import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, read: vi.fn(), fetch: vi.fn(), metadata: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/mcp/editorial', () => ({ getCmsArticle: mock.read }));
vi.mock('@/lib/image-gen/webflow', () => ({ imageGenCmsConfiguration: () => ({ token: 'test-fixture', collection: 'b'.repeat(24), locale: 'c'.repeat(24) }) }));
vi.mock('@/lib/seo-engine/post-publish/editorial', () => ({ assertEditorialMetadataWritable: mock.metadata }));
vi.mock('@/lib/webflow-mapping', () => ({ readMapping: () => ({ entries: [{ internal: 'title', webflowSlug: 'name' }, { internal: 'content', webflowSlug: 'content' }, { internal: 'seoTitle', webflowSlug: 'seo-title' }] }) }));
import { saveStagedCopyedit } from '@/lib/mcp/staged-copyedit';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const memory = memoryFirestore(), uid = 'frederik', itemId = 'a'.repeat(24), draftId = `mcp-${itemId}`;
let before: any, after: any, binding: any, saved: any, input: any;
beforeEach(() => {
  memory.clear(); vi.clearAllMocks(); mock.db = memory.db; vi.stubGlobal('fetch', mock.fetch);
  const article = { title: 'Original', content: '<p>Tekst.</p>', seoTitle: 'Original' };
  const fields = { name: 'Original', content: article.content, 'seo-title': article.seoTitle, unrelated: 'keep-me', 'ai-generated': false };
  before = { id: itemId, fields, cmsHash: cmsFieldHash(fields), isDraft: false, lastPublished: '2026-09-28T08:00:00Z' };
  const changed = { ...fields, content: '<p>Rettet tekst.</p>' };
  after = { ...before, fields: changed, cmsHash: cmsFieldHash(changed) };
  binding = { itemId, cmsHash: before.cmsHash, fields, article };
  memory.rows.set(`writerWorkspaces/${uid}/mcpBindings/${draftId}`, structuredClone(binding));
  saved = { revision: 2, data: { currentDraftId: draftId, articleData: { ...article, content: changed.content } } };
  memory.rows.set(`writerWorkspaces/${uid}`, saved);
  input = { draftId, expectedRevision: 2, expectedCmsHash: before.cmsHash };
  mock.read.mockResolvedValueOnce(before).mockResolvedValueOnce(before).mockResolvedValue(after);
  mock.fetch.mockResolvedValue(new Response('{}'));
});
afterEach(() => vi.unstubAllGlobals());
it('patches only staged changed fields, never isDraft, publication dates or unrelated content', async () => {
  expect(await saveStagedCopyedit(uid, input, saved, binding)).toMatchObject({ stagedOnly: true, publicationVerified: false, changedFields: ['content'] });
  expect(mock.fetch).toHaveBeenCalledTimes(1); const [url, options] = mock.fetch.mock.calls[0];
  expect(url).not.toContain('publish'); expect(options.method).toBe('PATCH');
  expect(JSON.parse(options.body)).toEqual({ cmsLocaleId: 'c'.repeat(24), fieldData: { content: '<p>Rettet tekst.</p>' } });
  expect(memory.rows.has(`mcpCmsLocks/${itemId}`)).toBe(false);
});
it('returns the same verified receipt after a repeated click', async () => {
  await saveStagedCopyedit(uid, input, saved, binding);
  expect(await saveStagedCopyedit(uid, input, saved, binding)).toMatchObject({ replay: true }); expect(mock.fetch).toHaveBeenCalledTimes(1);
});
it('reconciles a timeout with reads, not another patch', async () => {
  mock.fetch.mockRejectedValueOnce(Error('timeout'));
  await expect(saveStagedCopyedit(uid, input, saved, binding)).rejects.toThrow('timeout');
  expect(await saveStagedCopyedit(uid, input, saved, binding)).toMatchObject({ replay: true, stagedOnly: true }); expect(mock.fetch).toHaveBeenCalledTimes(1);
});
it('retains an uncertain write and rejects a fresh identity to bypass it', async () => {
  mock.fetch.mockRejectedValueOnce(Error('timeout')); mock.read.mockReset().mockResolvedValue(before);
  await expect(saveStagedCopyedit(uid, input, saved, binding)).rejects.toThrow();
  await expect(saveStagedCopyedit(uid, input, saved, binding)).rejects.toThrow('reconciliation_required');
  await expect(saveStagedCopyedit(uid, { ...input, expectedRevision: 3 }, saved, binding)).rejects.toThrow('reconciliation_required'); expect(mock.fetch).toHaveBeenCalledTimes(1);
});
it.each(['initial', 'prewrite', 'workspace', 'binding', 'readback', 'publication'])('detects the %s conflict without claiming success', async stage => {
  if (stage === 'initial') input.expectedCmsHash = 'f'.repeat(64);
  if (stage === 'prewrite') mock.read.mockReset().mockResolvedValueOnce(before).mockResolvedValue({ ...before, cmsHash: 'd'.repeat(64) });
  if (stage === 'workspace') memory.rows.get(`writerWorkspaces/${uid}`).revision = 3;
  if (stage === 'binding') memory.rows.get(`writerWorkspaces/${uid}/mcpBindings/${draftId}`).openedAt = 'newer-open';
  if (stage === 'readback') mock.read.mockReset().mockResolvedValue(before);
  if (stage === 'publication') mock.read.mockReset().mockResolvedValueOnce(before).mockResolvedValueOnce(before).mockResolvedValue({ ...after, isDraft: true });
  await expect(saveStagedCopyedit(uid, input, saved, binding)).rejects.toThrow();
  expect(mock.fetch).toHaveBeenCalledTimes(['readback', 'publication'].includes(stage) ? 1 : 0);
});
it.each(['<img src="https://example.com/unvalidated.jpg">', '<img src="/unchecked.jpg">', '<video src="https://example.com/new.mp4"></video>'])('does not smuggle new media through a text edit %s', async html => {
  saved.data.articleData.content += html; await expect(saveStagedCopyedit(uid, input, saved, binding)).rejects.toThrow('dedicated_media'); expect(mock.fetch).not.toHaveBeenCalled();
});
it('does not overwrite unknown fields or change the live URL', async () => {
  saved.data.articleData.slug = 'different'; await expect(saveStagedCopyedit(uid, input, saved, binding)).rejects.toThrow('dedicated_media'); expect(mock.fetch).not.toHaveBeenCalled();
});
