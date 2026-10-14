import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, stored: new Map<string, Buffer>() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db, getAdminStorageBucket: () => ({ file: (path: string) => ({
  save: async (bytes: Buffer) => state.stored.set(path, Buffer.from(bytes)), download: async () => [state.stored.get(path)] }) }) }));
import { getChatImageBrief } from '@/lib/editorial/chat-image-brief';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { buildAproposImagePrompt } from '@/lib/image-gen/prompt';
import { readImageGenStyleConfig } from '@/lib/image-gen/style-config';
import { promptHash } from '@/lib/editorial/image-generation-evidence';
import * as styles from '@/lib/image-gen/style-config';
import { storeSubmissionImageReference } from '@/lib/editorial/image-reference';
import sharp from 'sharp';
const files = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readChatGptImage: (...args: unknown[]) => files.read(...args) }));
const id = 'a'.repeat(64), path = `editorialSubmissions/${id}`;
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => {
  vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-bucket'); state.stored.clear();
  memory = memoryFirestore(); state.db = memory.db;
  memory.rows.set(path, { id, uid: 'team', revision: 1, contentHash: 'b'.repeat(64), status: 'draft', research: [],
    article: { title: 'Scenen med aben', subjectType: 'music', content: '<p>En stor abe var bygget som dekoration på scenen.</p>' } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); files.read.mockReset(); });
async function input() {
  const { article } = await readImageGenSnapshot('team', `submission-${id}`);
  return { submissionId: id, expectedRevision: 1, sectionId: article.sections[0].id,
    excerpt: article.sections[0].text, description: 'En stiliseret scene med en stor abe som dekoration.', role: 'cover', style: 'expressive' };
}
it('exports the same canonical prompt as server generation, actual reference bytes and stable retained identity', async () => {
  const value = await input(), first = await getChatImageBrief('team', value), second = await getChatImageBrief('team', value);
  expect(first.brief.prompt).toBe(buildAproposImagePrompt({ config: await readImageGenStyleConfig(), style: 'expressive',
    title: 'Scenen med aben', passage: value.excerpt, description: value.description }));
  expect(first.brief.briefId).toBe(second.brief.briefId); expect(first.brief.paidAiCalls).toBe(0);
  expect(Buffer.from(first.reference.data, 'base64').length).toBeGreaterThan(1000);
  expect(first.reference.mimeType).toBe('image/jpeg');
  expect(first.brief.visualEvidence.status).toBe('not_server_verified');
  expect(first.brief.canonicalPromptHash).toBe(promptHash(first.brief.prompt));
  expect(first.brief.referenceHash).toBe((await import('node:crypto')).createHash('sha256').update(Buffer.from(first.reference.data, 'base64')).digest('hex'));
  expect(first.brief.generationContract.instruction).toContain('Do not summarize, rewrite, embellish');
  expect(first.brief.generationContract.exactPromptExecutionVerified).toBe(false);
});
it('rejects invented scenes, another user, changed text, film stills and nonexistent edit references', async () => {
  const value = await input();
  await expect(getChatImageBrief('other', value)).rejects.toThrow('not_found');
  await expect(getChatImageBrief('team', { ...value, excerpt: 'En løve hoppede ud til publikum.' })).rejects.toThrow('anchor_changed');
  await expect(getChatImageBrief('team', { ...value, expectedRevision: 2 })).rejects.toThrow('revision_conflict');
  await expect(getChatImageBrief('team', { ...value, editInstruction: 'Remove hat' })).rejects.toThrow('parent_required');
  memory.rows.get(path).article.subjectType = 'film';
  await expect(getChatImageBrief('team', value)).rejects.toThrow('film_requires_real_stills');
});
it('blocks unavailable or non-raster actual style references without saving a usable brief', async () => {
  const value = await input();
  const mock = vi.spyOn(styles, 'imageGenStyleReference').mockRejectedValueOnce(Error('storage missing'))
    .mockResolvedValueOnce(new File(['<html>blocked</html>'], 'style.jpg', { type: 'image/jpeg' }));
  await expect(getChatImageBrief('team', value)).rejects.toThrow('style_reference_required');
  await expect(getChatImageBrief('team', value)).rejects.toThrow('style_reference_required');
  expect(mock).toHaveBeenCalledTimes(2); expect([...memory.rows.keys()].some(key => key.includes('/chatBriefs/'))).toBe(false);
});
it('retains a requested user subject photo and returns its actual unchanged bytes after the canonical style', async () => {
  const bytes = await sharp({ create: { width: 900, height: 700, channels: 3, background: 'tan' } }).jpeg().toBuffer();
  files.read.mockResolvedValue(bytes);
  const request = { submissionId: id, expectedRevision: 1, requestId: 'subject-original-0001', purpose: 'user-uploaded-subject-photo',
    file: { file_id: 'file-photo', download_url: 'https://files.test/photo?signature=SECRET', mime_type: 'image/jpeg' } };
  const saved = await storeSubmissionImageReference('team', request);
  expect(saved).toMatchObject({ paidAiCalls: 0, replay: false, byteCount: bytes.length });
  expect(await storeSubmissionImageReference('team', request)).toMatchObject({ replay: true, referenceId: saved.referenceId });
  expect(files.read).toHaveBeenCalledTimes(1);
  const value = await input();
  await expect(getChatImageBrief('team', { ...value, subjectReferencesRequired: true })).rejects.toThrow('subject_reference_required');
  await expect(getChatImageBrief('team', { ...value, subjectReferenceIds: ['e'.repeat(64)] })).rejects.toThrow('subject_reference_required');
  const result = await getChatImageBrief('team', { ...value, subjectReferenceIds: [saved.referenceId], subjectReferencesRequired: true });
  expect(Buffer.from(result.additionalReferences[0].data, 'base64')).toEqual(bytes);
  expect(result.brief.requiredReferenceHashes).toEqual([result.brief.referenceHash, saved.sha256]);
  expect(result.brief.prompt).toContain('user-uploaded subject photos');
  expect(result.brief.output).toMatchObject({ count: 1, kind: 'standalone-illustration', text: 'none' });
  expect(memory.rows.get(path).revision).toBe(1); expect(memory.rows.get(path).article.featuredImage).toBeUndefined();
  expect(JSON.stringify([...memory.rows])).not.toContain('SECRET');
  await expect(storeSubmissionImageReference('other', request)).rejects.toThrow('not_found');
  await expect(storeSubmissionImageReference('team', { ...request, expectedRevision: 2 })).rejects.toThrow('idempotency_conflict');
  files.read.mockResolvedValue(Buffer.from('not the same photo'));
  await expect(storeSubmissionImageReference('team', { ...request, file: { ...request.file, file_id: 'rotated' } })).rejects.toThrow('reference_invalid');
});
it('returns the actual preserved edit-parent reference, and refuses a missing original', async () => {
  const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'blue' } }).png().toBuffer();
  const hash = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'), parentId = 'f'.repeat(64);
  const record = { uid: 'team', url: 'https://cdn.test/parent.png', originalHash: hash, storagePath: 'parent/original', mimeType: 'image/png', byteCount: bytes.length, width:1200, height:800 };
  state.stored.set(record.storagePath, bytes); memory.rows.set(`${path}/chatAssets/${parentId}`, record);
  const value = { ...await input(), parentAssetId: parentId, editInstruction: 'Remove the hat from the subject.' };
  const result = await getChatImageBrief('team', value);
  expect(Buffer.from(result.additionalReferences[0].data, 'base64')).toEqual(bytes);
  expect(result.brief.requiredReferenceHashes).toEqual([result.brief.referenceHash, hash]);
  expect(result.brief.prompt).toContain('second reference is the image to edit');
  memory.rows.get(`${path}/chatAssets/${parentId}`).storagePath = '';
  await expect(getChatImageBrief('team', value)).rejects.toThrow('reference_missing');
});
