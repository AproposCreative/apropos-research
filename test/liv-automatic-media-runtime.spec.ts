import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ row: undefined as any, writes: vi.fn(), stages: vi.fn(), save: vi.fn(), download: vi.fn(),
  chat: vi.fn(), generate: vi.fn(), read: vi.fn(), dbAvailable: true, keyAvailable: true }));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mocks.dbAvailable ? {
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set: mocks.stages }) }), update: async (patch: any) => { Object.assign(mocks.row, patch); } }) }),
    runTransaction: async (fn: any) => fn({ get: async () => ({ data: () => mocks.row }), set: (_ref: any, patch: any) => { mocks.writes(patch); mocks.row = patch; } }),
  } : null,
  getAdminStorageBucket: () => ({ file: () => ({ save: mocks.save, download: mocks.download }) }),
}));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => mocks.keyAvailable ? { chat: { completions: { create: mocks.chat } }, images: { generate: mocks.generate } } : null }));
vi.mock('@/lib/liv/model-config', () => ({ livModels: () => ({ utility: 'test-utility-model' }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: mocks.read }));
import { livMediaRuntime, aproposIllustrationStyle } from '@/lib/liv/automatic-media-runtime';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
const id = 'b'.repeat(64);
const article = { title: 'Kunst i byen', intro: 'Kunst med mening', slug: 'kunst-i-byen', content: '<p>Indhold</p>' } as GeneratedArticle;
let image: Buffer;
beforeAll(async () => { image = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#ff3388' } }).png().toBuffer(); });
beforeEach(() => {
  vi.clearAllMocks(); mocks.row = undefined; mocks.dbAvailable = true; mocks.keyAvailable = true;
  vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-bucket');
  vi.stubEnv('LIV_IMAGE_MODEL', 'gpt-image-1.5');
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'true');
  vi.stubEnv('LIV_OFFICIAL_IMAGE_HOSTS', 'sfstudios.dk');
  mocks.save.mockResolvedValue(undefined); mocks.download.mockResolvedValue([image]);
  mocks.generate.mockResolvedValue({ data: [{ b64_json: image.toString('base64') }], usage: { total_tokens: 100 } });
  mocks.chat.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: '{"images":[]}' } }], usage: { total_tokens: 30 } });
});
afterEach(() => vi.unstubAllEnvs());
it('claims once and records the original text, rejecting blind paid retries', async () => {
  const deps = livMediaRuntime();
  expect(await deps.claim(id, article, 'illustration', 'minimal')).toBeNull();
  expect(mocks.row).toMatchObject({ status: 'processing', article, style: 'minimal', estimatedCost: null });
  await expect(deps.claim(id, article, 'illustration', 'minimal')).rejects.toThrow('reconciliation');
  expect(mocks.writes).toHaveBeenCalledTimes(1);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('returns the exact completed revision without spending again', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  const completed = { ...article, content: 'Finished content' };
  await deps.complete(id, completed);
  expect(await deps.claim(id, article, 'illustration', 'expressive')).toEqual(completed);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('stores the raw provider image immutably and records actual usage before returning', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'minimal');
  expect(await deps.generate('Et enkelt kunstmotiv', id, 'hero')).toEqual(image);
  expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-image-1.5', n: 1, prompt: expect.stringContaining('Minimal classic ink') }), expect.objectContaining({ maxRetries: 0 }));
  expect(mocks.save).toHaveBeenCalledWith(image, expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 } }));
  const hash = createHash('sha256').update(image).digest('hex');
  expect(mocks.stages).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'complete', original: expect.objectContaining({ contentHash: hash }), usage: { total_tokens: 100 }, estimatedCost: null }), { merge: true });
  expect(mocks.stages.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
});
it('records uncertain provider attempts, makes no automatic retries, and leaves them for reconciliation', async () => {
  const deps = livMediaRuntime();
  await deps.claim(id, article, 'illustration', 'expressive');
  mocks.generate.mockRejectedValue(new Error('timeout'));
  await expect(deps.generate('Motiv', id, 'hero')).rejects.toThrow('timeout');
  await deps.fail(id);
  expect(mocks.row.status).toBe('failed');
  await expect(deps.claim(id, article, 'illustration', 'expressive')).rejects.toThrow('reconciliation');
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.save).not.toHaveBeenCalled();
});
it('honours the existing image-generation switch and time budget before an API call', async () => {
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'false');
  await expect(livMediaRuntime().generate('Motiv', id, 'hero')).rejects.toThrow('disabled');
  vi.stubEnv('AI_IMAGE_GENERATION_ENABLED', 'true');
  await expect(livMediaRuntime(Date.now() - 1).generate('Motiv', id, 'hero')).rejects.toThrow('time_budget');
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('never opens another source host or invents photo credits', async () => {
  mocks.read.mockImplementation(async (url, kind) => kind === 'html' ? Buffer.from('<figure><img src="https://images.example.com/still.png"><figcaption>Foto: Anna / SF Studios</figcaption></figure>') : image);
  const result = await livMediaRuntime().candidates({ ...article, imageSuggestions: [
    { url: 'https://images.example.com/still.png', sourcePageUrl: 'https://sfstudios.dk/film', source: 'SF' },
    { url: 'https://elsewhere.example.com/photo.png', sourcePageUrl: 'https://sfstudios.dk.evil.example.com/film', source: 'Unknown' },
  ] });
  expect(result).toHaveLength(1);
  expect(result[0].credit).toBe('Foto: Anna / SF Studios');
  expect(mocks.read.mock.calls.map(call => call[0])).toEqual(['https://sfstudios.dk/film', 'https://images.example.com/still.png']);
});
it('fails closed on truncated model JSON or uncertain visual review', async () => {
  const deps = livMediaRuntime();
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] });
  await expect(deps.plan(article, 'illustration', 'expressive', [], id)).rejects.toThrow('incomplete');
  mocks.chat.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: '{"pass":false}' } }] });
  expect(await deps.review(article, 'illustration', [{ bytes: image, alt: 'Motiv', caption: 'Tekst' }], id)).toBe(false);
});
it('does not silently create clients or credentials if the existing configuration is missing', () => {
  mocks.keyAvailable = false;
  expect(() => livMediaRuntime()).toThrow('model_unavailable');
  mocks.dbAvailable = false;
  expect(() => livMediaRuntime()).toThrow('storage_unavailable');
});
it('defines both requested styles with no collage and few focal objects', () => {
  expect(aproposIllustrationStyle('expressive')).toContain('cobalt blue, hot pink and yellow');
  expect(aproposIllustrationStyle('minimal')).toContain('at most one restrained accent');
  for (const style of ['expressive', 'minimal'] as const) {
    expect(aproposIllustrationStyle(style)).toContain('No collage');
    expect(aproposIllustrationStyle(style)).toContain('very few objects');
  }
});
