import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('@/lib/images/text-free', () => ({ ensureTextFreeImage: async (bytes: Buffer) => ({ bytes, receipt: { id: 'verified-text-free-fixture' } }) }));
const f = vi.hoisted(() => ({ read: vi.fn(), finish: vi.fn(), job: vi.fn(), chat: vi.fn(), search: vi.fn(), edit: vi.fn(),
  media: vi.fn(), rows: new Map<string, any>(), files: new Map<string, Buffer>() }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (key: string): any => ({ collection: (name: string) => ({ doc: (id: string) => ref(`${key}/${name}/${id}`) }),
    get: async () => ({ data: () => f.rows.get(key) }),
    create: async (data: any) => { if (f.rows.has(key)) throw Error('exists'); f.rows.set(key, data); },
    update: async (data: any) => f.rows.set(key, { ...f.rows.get(key), ...data }) });
  return { getAdminDb: () => ({ collection: (n: string) => ({ doc: (id: string) => ref(`${n}/${id}`) }) }),
    getAdminStorageBucket: () => ({ file: (key: string) => ({ save: async (bytes: Buffer) => { f.files.set(key, Buffer.from(bytes)); },
      download: async () => { if (!f.files.has(key)) throw Error('missing'); return [f.files.get(key)]; } }) }) };
});
vi.mock('@/lib/image-gen/webflow', () => ({ readImageGenArticle: f.read }));
vi.mock('@/lib/image-gen/jobs', () => ({ finishImageGenJob: f.finish, readImageGenJob: f.job }));
vi.mock('@/lib/image-gen/quotes', () => ({ imageGenQuotes: async () => ({ ideas: { id: 'quote' }, generate: { id: 'quote' }, edit: { id: 'quote' } }) }));
vi.mock('@/lib/image-gen/style-config', () => ({ readImageGenStyleConfig: async () => ({ version: 'fixture-style' }),
  imageGenStyleReference: async () => new File([new Uint8Array([1])], 'reference.webp', { type: 'image/webp' }),
  imageGenStylePrompt: () => 'One simple scene, not a documentary photograph.' }));
vi.mock('@/lib/openai', () => ({ getImageGenOpenAIClient: () => ({ chat: { completions: { create: f.chat } }, responses: { create: f.search }, images: { edit: f.edit } }) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: f.media }));
import { imageGenArticle } from '@/lib/image-gen/article';
import { runImageGenJob, readImageGenAsset } from '@/lib/image-gen/runtime';
const article = imageGenArticle('a'.repeat(24), 'Gobs', '<p>Koncerten var lys og mørke i samspil.</p>', null);
const job = { uid: 'milo', id: 'b'.repeat(64), articleId: article.id, articleVersion: article.version, operation: 'generate',
  parameters: { acceptedQuoteId: 'quote', description: 'En illustration af lys og mørke.', style: 'expressive', sectionId: article.sections[0].id } } as any;
beforeEach(async () => {
  vi.resetAllMocks(); f.rows.clear(); f.files.clear(); vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'fixture');
  f.finish.mockResolvedValue(undefined); f.read.mockResolvedValue({ article });
  const bytes = await sharp({ create: { width: 640, height: 400, channels: 3, background: '#345' } }).webp().toBuffer();
  f.edit.mockResolvedValue({ data: [{ b64_json: bytes.toString('base64') }], usage: { input_tokens: 20, output_tokens: 100 } });
});
it('persists original and optimized result, retrieves it privately, and never starts a second generation', async () => {
  await runImageGenJob(job);
  expect(f.edit).toHaveBeenCalledOnce(); expect(f.files.size).toBe(2);
  const result = f.finish.mock.calls[0][2]; expect(result.status).toBe('succeeded');
  expect(result.result).toMatchObject({ provider: 'openai', styleVersion: 'fixture-style', credit: 'Illustration: Apropos Magazine / AI' });
  f.job.mockResolvedValue({ ...job, ...result });
  expect((await readImageGenAsset('milo', job.id)).bytes.length).toBeGreaterThan(0);
  await expect(readImageGenAsset('casper', job.id)).rejects.toThrow('asset_invalid');
  expect(f.edit).toHaveBeenCalledOnce();
});
it('carries the bounded visual research into the paid image prompt', async () => {
  const visualResearch = { status: 'researched', brief: 'VISUEL RESEARCH: Gobs er Victor Gaardboe. Officielle presseportrætter viser ofte kasket, kæder og afslappet urban styling.', sources: ['https://gobs.dk/'] };
  await runImageGenJob({ ...job, parameters: { ...job.parameters, visualResearch } });
  const prompt = f.edit.mock.calls[0][0].prompt as string;
  expect(prompt).toContain('Victor Gaardboe');
  expect(prompt).toContain('gobs.dk');
});
it('edits using the actual previous image plus the style reference', async () => {
  await runImageGenJob(job); const result = f.finish.mock.calls[0][2];
  f.job.mockResolvedValue({ ...job, ...result });
  await runImageGenJob({ ...job, id: 'c'.repeat(64), operation: 'edit', parameters: { ...job.parameters, parentJobId: job.id, editInstruction: 'Gør baggrunden pink.' } });
  expect(f.edit).toHaveBeenCalledTimes(2);
  const input = f.edit.mock.calls[1][0]; expect(input.image).toHaveLength(2);
  expect(input.prompt).toContain('Gør baggrunden pink.'); expect(input.image[1].size).toBe(result.result.bytes);
});
it('does not spend if text version or quote changed', async () => {
  await runImageGenJob({ ...job, articleVersion: 'changed' });
  await runImageGenJob({ ...job, parameters: { ...job.parameters, acceptedQuoteId: 'old' } });
  expect(f.edit).not.toHaveBeenCalled();
  expect(f.finish.mock.calls.every(c => c[2].status === 'failed-before-provider')).toBe(true);
});
it('retains uncertain provider failures without retries or fabricated output', async () => {
  f.edit.mockRejectedValue(new Error('provider connection lost'));
  await runImageGenJob(job); expect(f.edit).toHaveBeenCalledOnce(); expect(f.files.size).toBe(0);
  expect(f.finish).toHaveBeenCalledWith(job.uid, job.id, { status: 'uncertain', errorCode: 'result_requires_review' });
});
it('keeps validated motifs if the one press search fails', async () => {
  f.chat.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ motifs: [1,2,3].map(n => ({ title: `Motiv ${n}`,
    description: `En enkel illustration med motiv ${n}.`, sectionId: article.sections[0].id, excerpt: article.sections[0].text })) }) } }] });
  f.search.mockRejectedValue(new Error('search unavailable'));
  await runImageGenJob({ ...job, operation: 'ideas' });
  expect(f.chat).toHaveBeenCalledOnce(); expect(f.search).toHaveBeenCalledOnce(); expect(f.edit).not.toHaveBeenCalled();
  expect(f.finish.mock.calls[0][2]).toMatchObject({ status: 'succeeded', result: { motifs: expect.any(Array), press: { status: 'unavailable_no_automatic_retry' } } });
});
it('persists source-backed visual research from the existing bounded press call', async () => {
  f.chat.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ motifs: [1,2,3].map(n => ({ title: `Motiv ${n}`,
    description: `En enkel illustration med motiv ${n}.`, sectionId: article.sections[0].id, excerpt: article.sections[0].text })) }) } }] });
  f.search.mockResolvedValue({ output: [
    { type: 'message', content: [{ type: 'output_text', text: 'VISUEL RESEARCH: Gobs er Victor Gaardboe. Officielle pressebilleder viser kasket, kæder og afslappet urban styling.', annotations: [{ type: 'url_citation', url: 'https://gobs.dk/' }] }] },
    { type: 'web_search_call', action: { sources: [{ url: 'https://gobs.dk/' }] } },
  ] });
  f.media.mockResolvedValue(Buffer.from('<meta property="og:image" content="https://gobs.dk/press.jpg">'));
  await runImageGenJob({ ...job, operation: 'ideas' });
  expect(f.finish.mock.calls[0][2]).toMatchObject({ status: 'succeeded', result: {
    visualResearch: { status: 'researched', brief: expect.stringContaining('Victor Gaardboe'), sources: ['https://gobs.dk/'] },
  } });
});
it('does not fetch a press image without explicit rights confirmation', async () => {
  await runImageGenJob({ ...job, operation: 'press-import', parameters: { ideasJobId: 'c'.repeat(64), candidateId: 'd'.repeat(64), credit: 'Foto: Test' } });
  expect(f.media).not.toHaveBeenCalled(); expect(f.edit).not.toHaveBeenCalled();
  expect(f.finish.mock.calls[0][2].status).toBe('failed-before-provider');
});
it('recovers stored original bytes under a new audit ID without another provider call', async () => {
  await runImageGenJob(job);
  f.job.mockResolvedValue({ ...job, status: 'uncertain' });
  await runImageGenJob({ ...job, id: 'e'.repeat(64), operation: 'recover', parameters: { parentJobId: job.id } });
  expect(f.edit).toHaveBeenCalledOnce();
  expect(f.finish.mock.calls[1][2]).toMatchObject({ status: 'succeeded', result: { provider: 'openai', styleVersion: 'fixture-style' } });
  expect(f.files.size).toBe(3);
});
