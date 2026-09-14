import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ read: vi.fn(), patch: vi.fn(), job: vi.fn(), finish: vi.fn(), asset: vi.fn(), upload: vi.fn(),
  rows: new Map<string, any>() }));
vi.mock('@/lib/image-gen/webflow', () => ({ readImageGenArticle: f.read, patchImageGenDraft: f.patch }));
vi.mock('@/lib/image-gen/jobs', () => ({ readImageGenJob: f.job, finishImageGenJob: f.finish }));
vi.mock('@/lib/image-gen/runtime', () => ({ readImageGenAsset: f.asset }));
vi.mock('@/lib/image-gen/cms-asset', () => ({ uploadImageGenCmsAsset: f.upload }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (key: string): any => ({ key, collection: (n: string) => ({ doc: (id: string) => ref(`${key}/${n}/${id}`) }),
    get: async () => ({ data: () => f.rows.get(key) }), create: async (v: any) => { if (f.rows.has(key)) throw Error('exists'); f.rows.set(key, v); },
    set: async (v: any) => { f.rows.set(key, v); }, update: async (v: any) => { f.rows.set(key, { ...f.rows.get(key), ...v }); } });
  return { getAdminDb: () => ({ collection: (n: string) => ({ doc: (id: string) => ref(`${n}/${id}`) }),
    runTransaction: (fn: any) => fn({ get: (r: any) => r.get(), set: (r: any, v: any) => r.set(v) }) }) };
});
import { imageGenArticle } from '@/lib/image-gen/article';
import { previewImageGenDraft, saveImageGenDraft, validateImageGenSelections } from '@/lib/image-gen/draft';
const id = 'a'.repeat(24), assetId = 'b'.repeat(64), uid = 'milo';
const article = imageGenArticle(id, 'Gobs', '<p>Gobs sang i lyset.</p><p>Festen fortsatte.</p>', null);
const selection = { jobId: assetId, target: 'body' as const, sectionId: article.sections[0].id, alt: 'Illustration af en scene', caption: 'Illustration.', credit: 'Illustration: Apropos Magazine / AI' };
const base = { article, cover: null, coverCredit: null, isDraft: false, lastPublished: '2026-09-01T10:00:00Z' };
beforeEach(() => {
  vi.resetAllMocks(); f.rows.clear(); f.finish.mockResolvedValue(undefined); f.read.mockResolvedValue(base); f.job.mockResolvedValue({ status: 'succeeded', operation: 'generate', articleId: id });
  f.asset.mockResolvedValue({ bytes: Buffer.from('test'), asset: { hash: 'c'.repeat(64), credit: selection.credit } });
  f.upload.mockImplementation(async (_bytes, _name, checkpoint) => { const result = { id: 'd'.repeat(24), url: 'https://cdn.prod.website-files.com/site/image.webp' }; await checkpoint(result); return result; });
  f.patch.mockImplementation(async (_id, fields) => { f.read.mockResolvedValue({ ...base, article: { ...article, content: fields.content, version: 'e'.repeat(64) } }); });
});
it('preview enforces current article, owner assets, original credit and explicit cover replacement', async () => {
  await expect(previewImageGenDraft(uid, id, article.version, [selection])).resolves.toMatchObject({ publication: 'staged-only' });
  expect(f.patch).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled();
  await expect(previewImageGenDraft(uid, id, 'f'.repeat(64), [selection])).rejects.toThrow('article_changed');
  await expect(previewImageGenDraft(uid, id, article.version, [{ ...selection, credit: 'Fake' }])).rejects.toThrow('credit_changed');
  f.job.mockResolvedValueOnce(null);
  await expect(previewImageGenDraft(uid, id, article.version, [selection])).rejects.toThrow('asset_invalid');
  f.read.mockResolvedValue({ ...base, cover: { url: 'https://example.org/old.jpg' } });
  await expect(previewImageGenDraft(uid, id, article.version, [{ ...selection, target: 'cover' }])).rejects.toThrow('confirmation_required');
});
it('rejects duplicates and arbitrary destinations', () => {
  expect(() => validateImageGenSelections([selection, selection])).toThrow();
  expect(() => validateImageGenSelections([{ ...selection, target: 'live' }])).toThrow();
});
async function makeJob() {
  const preview = await previewImageGenDraft(uid, id, article.version, [selection]);
  return { uid, id: 'f'.repeat(64), articleId: id, articleVersion: article.version,
    parameters: { selections: [selection], previewId: preview.previewId } } as any;
}
it('adds only selected image fields to staged content, reads back and retains live state', async () => {
  const job = await makeJob(); await saveImageGenDraft(job);
  expect(f.patch).toHaveBeenCalledOnce();
  const fields = f.patch.mock.calls[0][1]; expect(Object.keys(fields)).toEqual(['content']);
  expect(fields.content).toContain('Gobs sang i lyset.'); expect(fields.content).toContain('<figure');
  expect(f.finish).toHaveBeenCalledWith(uid, job.id, expect.objectContaining({ status: 'succeeded', result: expect.objectContaining({ publication: 'staged-only' }) }));
});
it('rejects an external edit detected immediately before patch without overwriting it', async () => {
  const job = await makeJob();
  f.read.mockResolvedValueOnce(base).mockResolvedValueOnce({ ...base, article: { ...article, version: 'changed' } });
  await saveImageGenDraft(job); expect(f.patch).not.toHaveBeenCalled();
  expect(f.finish).toHaveBeenCalledWith(uid, job.id, expect.objectContaining({ status: 'failed-before-provider' }));
});
it('does not retry an uncertain CMS write and retains the shared lock for readback', async () => {
  const job = await makeJob(); f.patch.mockRejectedValue(new Error('connection lost'));
  await saveImageGenDraft(job); expect(f.patch).toHaveBeenCalledOnce();
  expect(f.finish).toHaveBeenCalledWith(uid, job.id, expect.objectContaining({ status: 'uncertain', errorCode: 'cms_readback_required' }));
  expect(f.rows.get(`imageGenArticleLocks/${id}`).jobId).toBe(job.id);
});
