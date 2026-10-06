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
  kind: 'illustration', role: 'cover', briefId, alt: 'En illustration af koncerten', caption: 'Koncerten', credit: 'User supplied' });
async function brief(role = 'cover', sectionId?: string) {
  memory.rows.set(`${path}/chatBriefs/${briefId}`, { uid: 'team', contentHash: version, role, sectionId: sectionId || null });
}
it('retains the private original and attaches a durable CMS asset once, without persisting signed URLs or claiming prompt verification', async () => {
  await brief(); const first = await importChatImage('team', input());
  expect(first).toMatchObject({ revision: 2, paidAiCalls: 0, publicationApproval: false });
  expect(await importChatImage('team', { ...input(), file: { ...input().file, download_url: 'https://files.oaiusercontent.com/new?signature=changed' } })).toMatchObject({ replay: true, revision: 2 });
  expect(state.upload).toHaveBeenCalledTimes(1); expect(state.download).toHaveBeenCalledTimes(1);
  expect([...state.stored.values()][0]).toEqual(state.bytes);
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
  await expect(importChatImage('team', input())).rejects.toThrow('timeout');
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
  await expect(importChatImage('team', input())).rejects.toThrow('timeout');
  await expect(importChatImage('team', input())).rejects.toThrow('upload_unconfirmed');
  expect(state.upload).toHaveBeenCalledTimes(1);
});
it('rejects small image bytes before storage or upload', async () => {
  await brief();
  state.download.mockResolvedValue(await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).png().toBuffer());
  await expect(importChatImage('team', input())).rejects.toThrow('image_invalid');
  expect(state.upload).not.toHaveBeenCalled();
});
