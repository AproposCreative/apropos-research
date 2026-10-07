import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, bytes: Buffer.alloc(0), stored: new Map<string, Buffer>(), upload: vi.fn(), download: vi.fn(), readback: vi.fn(), breakAttachment: false }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db, getAdminStorageBucket: () => ({ file: (path: string) => ({
  save: async (bytes: Buffer) => { state.stored.set(path, Buffer.from(bytes)); }, download: async () => [state.stored.get(path)] }) }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readChatGptImage: (...args: unknown[]) => state.download(...args), readPublicMedia: (...args: unknown[]) => state.readback(...args) }));
vi.mock('@/lib/image-gen/cms-asset', () => ({ uploadImageGenCmsAsset: (...args: unknown[]) => state.upload(...args) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [], requiredFields: [], checkedAt: '' }) }));
import { importChatImage } from '@/lib/editorial/chat-image-import';
import { updateSubmission } from '@/lib/editorial/submissions';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const id = 'a'.repeat(64), version = 'b'.repeat(64), path = `editorialSubmissions/${id}`, briefId = 'c'.repeat(64);
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-bucket'); memory = memoryFirestore(); state.db = memory.db; state.stored.clear();
  state.bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#005a82' } }).png().toBuffer();
  state.download.mockResolvedValue(state.bytes);
  state.upload.mockImplementation(async (bytes: Buffer, name: string, saved: (asset: any) => Promise<void>) => {
    const asset = { id: 'cms-asset', url: `https://cdn.prod.website-files.com/test/${name}` };
    state.readback.mockResolvedValue(bytes); await saved(asset); return asset;
  });
  const article = { title: 'En koncert', content: '<p>Første   afsnit med en konkret scene.</p><p>Det næste afsnit.</p>', subjectType: 'music' };
  memory.rows.set(path, { id, uid: 'team', revision: 1, status: 'draft', contentHash: version, requestId: 'original-article-0001',
    article, originalArticle: article, research: [], choices: { kind: 'feature', media: 'illustration', style: 'expressive' } });
});
afterEach(() => vi.unstubAllEnvs());
const input = () => ({ submissionId: id, expectedRevision: 1, requestId: 'import-chat-image-0001',
  file: { download_url: 'https://files.oaiusercontent.com/image?signature=PRIVATE', file_id: 'file-personal-image', mime_type: 'image/png' },
  kind: 'illustration', role: 'cover', origin: 'chatgpt-generated', briefId, alt: 'En illustration af koncerten', caption: 'Koncerten', credit: 'User supplied' });
async function brief(role = 'cover', sectionId?: string) {
  memory.rows.set(`${path}/chatBriefs/${briefId}`, { uid: 'team', contentHash: version, role, sectionId: sectionId || null });
}
it('retains the private original and attaches a durable CMS asset once, without persisting signed URLs or claiming prompt verification', async () => {
  await brief(); const first = await importChatImage('team', input());
  expect(first).toMatchObject({ revision: 2, paidAiCalls: 0, publicationApproval: false });
  expect(await importChatImage('team', { ...input(), file: { ...input().file, download_url: 'https://files.oaiusercontent.com/new?signature=changed' } })).toMatchObject({ replay: true, revision: 2 });
  expect(state.upload).toHaveBeenCalledTimes(1); expect(state.download).toHaveBeenCalledTimes(1);
  expect([...state.stored.values()][0]).toEqual(state.bytes);
  expect(state.upload.mock.calls[0][0]).toEqual(state.bytes);
  expect(state.upload.mock.calls[0][1]).toMatch(/\.png$/);
  expect(state.upload.mock.calls[0][3]).toEqual({ preserveOriginal: true });
  const saved = JSON.stringify([...memory.rows]);
  expect(saved).not.toContain('PRIVATE'); expect(saved).not.toContain('download_url');
  expect(saved).toContain('chatgpt-supplied-unverified');
  expect(memory.rows.get(path).article.content).toBe(memory.rows.get(path).originalArticle.content);
});
it('uses exact paragraph identity and preserves all other text and assets', async () => {
  const { article } = await readImageGenSnapshot('team', `submission-${id}`), sectionId = article.sections[0].id;
  await brief('body', sectionId);
  await importChatImage('team', { ...input(), role: 'body', sectionId });
  const content = memory.rows.get(path).article.content;
  expect(content).toContain('Første   afsnit'); expect(content.indexOf('<figure')).toBeLessThan(content.indexOf('Det næste'));
  expect(content).toContain('Illustration: Apropos Magazine / AI');
});
it('refuses changed version, foreign owner, missing brief, film illustration and an edited request identity before downloading', async () => {
  await brief();
  await expect(importChatImage('other', input())).rejects.toThrow('not_found');
  await expect(importChatImage('team', { ...input(), expectedRevision: 2 })).rejects.toThrow('revision_conflict');
  await expect(importChatImage('team', { ...input(), briefId: undefined })).rejects.toThrow('brief_required');
  memory.rows.get(path).article.subjectType = 'film';
  await expect(importChatImage('team', input())).rejects.toThrow('film_requires_real_stills');
  expect(state.download).not.toHaveBeenCalled();
});
it('recovers uploaded bytes after transport timeout without another CMS allocation', async () => {
  await brief();
  const normal = state.upload.getMockImplementation()!;
  state.upload.mockImplementation(async (...args: any[]) => { await normal(...args); throw Error('timeout'); });
  await expect(importChatImage('team', input())).rejects.toThrow('asset_upload_unconfirmed');
  const result = await importChatImage('team', input());
  expect(result.revision).toBe(2); expect(state.upload).toHaveBeenCalledTimes(1); expect(state.readback).toHaveBeenCalledTimes(1);
});
it('recovers a committed attachment receipt even if acknowledgement was lost', async () => {
  await brief();
  const result = await importChatImage('team', input());
  const assetId = cmsFieldHash({ uid: 'team', id, requestId: input().requestId });
  memory.rows.get(`${path}/chatAssets/${assetId}`).status = 'uploaded';
  expect(await importChatImage('team', input())).toMatchObject({ revision: result.revision, replay: true });
  expect(memory.rows.get(path).revision).toBe(2); expect(state.upload).toHaveBeenCalledTimes(1);
});
it('does not allocate twice when CMS allocation itself is ambiguous', async () => {
  await brief(); state.upload.mockRejectedValue(Error('timeout'));
  await expect(importChatImage('team', input())).rejects.toThrow('asset_upload_unconfirmed');
  await expect(importChatImage('team', input())).rejects.toThrow('upload_unconfirmed');
  expect(state.upload).toHaveBeenCalledTimes(1);
});
it('rejects small image bytes before storage or upload', async () => {
  await brief();
  state.download.mockResolvedValue(await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).png().toBuffer());
  await expect(importChatImage('team', input())).rejects.toThrow('image_invalid');
  expect(state.upload).not.toHaveBeenCalled();
});
it('accepts an existing user-upload without inventing a generation brief or credit', async () => {
  const result = await importChatImage('team', { ...input(), briefId: undefined, origin: 'user-upload', credit: 'Foto: Frederik' });
  expect(result.revision).toBe(2); expect(memory.rows.get(path).article.fotoCredit).toBe('Foto: Frederik');
  await expect(updateSubmission('team', { submissionId: id, expectedRevision: 2, requestId: 'silent-replacement-0001',
    article: { featuredImage: 'https://cdn.test/fallback.jpg' } })).rejects.toThrow('selected_asset_locked');
  expect(memory.rows.get(path).article.featuredImage).toBe(result.url);
});
it('keeps legacy client origin unknown rather than fabricating a generation brief', async () => {
  const result = await importChatImage('team', { ...input(), origin: undefined, briefId: undefined });
  const saved = memory.rows.get(`${path}/chatAssets/${result.assetId}`);
  expect(saved).toMatchObject({ origin: 'unspecified', exactPromptExecutionVerified: false, credit: 'User supplied', preserveOriginal: true });
});
it.each(['jpeg', 'png', 'webp'] as const)('sniffs %s bytes when the adapter labels them binary', async format => {
  state.bytes = await sharp({ create: { width: 1280, height: 720, channels: 3, background: 'beige' } }).toFormat(format).toBuffer();
  state.download.mockResolvedValue(state.bytes);
  const result = await importChatImage('team', { ...input(), origin: 'user-upload', briefId: undefined, file: { ...input().file, mime_type: 'application/octet-stream' } });
  expect(state.upload.mock.calls[0][0]).toEqual(state.bytes); expect(result.revision).toBe(2);
});
it('marks ghost uploads unconfirmed and never silently reallocates or changes the article', async () => {
  await brief();
  state.upload.mockImplementation(async (_bytes, _name, checkpoint) => {
    await checkpoint({ id: 'ghost', url: 'https://cdn.test/zero.png' }); throw Error('S3 secret response');
  });
  await expect(importChatImage('team', input())).rejects.toThrow('asset_upload_unconfirmed');
  const saved = [...memory.rows.entries()].find(([key]) => key.includes('/chatAssets/'))![1];
  expect(saved.failure).toMatchObject({ assetReady: false, originalPreserved: true, stage: 'cms_asset_upload' });
  expect(JSON.stringify(saved)).not.toContain('secret response');
  state.readback.mockResolvedValue(Buffer.alloc(0));
  await expect(importChatImage('team', input())).rejects.toThrow('upload_unconfirmed');
  expect(state.upload).toHaveBeenCalledTimes(1); expect(memory.rows.get(path).revision).toBe(1);
});
