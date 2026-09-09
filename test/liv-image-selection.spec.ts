import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({ db: null as any, bucket: null as any, read: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mocks.db, getAdminStorageBucket: () => mocks.bucket }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: mocks.read }));
import { prepareLivStoryImage } from '@/lib/liv/prepare-story-image';
import { buildLivCmsPayload } from '@/lib/liv/build-cms-payload';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { resolveCmsFeaturedImage, cmsThumbValue } from '@/lib/liv/cms-image-input';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { mergeArticleUpdate, normalizeArticleData } from '@/app/ai/ai-writer/article-defaults';

const id = 'a'.repeat(64), uid = 'editor';
const input = { id, url: 'https://museum.dk/hero.png', alt: 'En tom udstillingssal med to stole', credit: 'Fotografens navn' };
const article: GeneratedArticle = { title: 'Et museum åbner', slug: 'et-museum-aabner', subtitle: 'Undertitel', intro: 'En intro', content: 'En selvstændig artikel', section: 'Kultur', tags: [], excerpt: 'Uddrag', rawResponse: '',
  imageSuggestions: [{ url: input.url, source: 'Museet', sourcePageUrl: 'https://museum.dk/article' }, { url: 'https://museum.dk/second.png', source: 'Museet' }] };
const storyKey = `editorialDesks/${uid}/stories/${id}`;
let rows: Map<string, any>, objects: Map<string, Buffer>;
let file: ReturnType<typeof vi.fn>, original: Buffer;
function reference(key: string): any { return { key, collection: (name: string) => reference(`${key}/${name}`), doc: (name: string) => reference(`${key}/${name}`) }; }
function update(ref: { key: string }, values: Record<string, unknown>) {
  const row = rows.get(ref.key);
  if (!row) throw new Error('missing row');
  for (const [key, value] of Object.entries(values)) {
    if (key === 'article.selectedImage') row.article.selectedImage = structuredClone(value);
    else row[key] = structuredClone(value);
  }
}
beforeEach(async () => {
  vi.resetAllMocks(); vi.stubEnv('FIREBASE_STORAGE_BUCKET', 'test-bucket');
  rows = new Map([[storyKey, { article: structuredClone(article), status: 'draft' }]]); objects = new Map();
  mocks.db = { collection: (name: string) => reference(name), runTransaction: async (callback: any) => callback({
    get: async (ref: { key: string }) => ({ exists: rows.has(ref.key), data: () => structuredClone(rows.get(ref.key)) }),
    set: (ref: { key: string }, value: unknown) => rows.set(ref.key, structuredClone(value)), update,
  }) };
  file = vi.fn((name: string) => ({
    save: vi.fn(async (bytes: Buffer, options: any) => {
      expect(options.preconditionOpts).toEqual({ ifGenerationMatch: 0 }); expect(options.metadata.cacheControl).toContain('immutable');
      if (objects.has(name)) throw new Error('already exists'); objects.set(name, Buffer.from(bytes));
    }),
    getMetadata: async () => [{ size: String(objects.get(name)!.length), contentType: 'image/webp' }],
    download: async () => [objects.get(name)!],
  }));
  mocks.bucket = { file };
  original = await sharp({ create: { width: 2048, height: 1200, channels: 3, background: '#827e73' } }).png().toBuffer();
  mocks.read.mockResolvedValue(original);
});
afterEach(() => vi.unstubAllEnvs());

describe('Liv persisted image selection', () => {
  it('stores measured immutable bytes and provenance on the exact article, without approving rights', async () => {
    const image = await prepareLivStoryImage(uid, input);
    expect(image).toMatchObject({ width: 1920, height: 1080, alt: input.alt, credit: input.credit, rightsStatus: 'unverified', visualReview: 'pending', sourcePageUrl: 'https://museum.dk/article', articleHash: livImageArticleHash(article) });
    const bytes = objects.get(image.storagePath)!;
    expect(image.bytes).toBe(bytes.length); expect(bytes.length).toBeLessThanOrEqual(450 * 1024);
    expect(image.contentHash).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(rows.get(storyKey).article.selectedImage.id).toBe(image.id);
    const payload = buildLivCmsPayload({ article: rows.get(storyKey).article, topic: { title: article.title, score: 1 } });
    expect(payload.featuredImage).toBe(image.url); expect(payload.featuredImageAlt).toBe(input.alt); expect(payload.fotoCredit).toBe(input.credit);
    expect(normalizeArticlePayload(payload).featuredImageHash).toBe(image.contentHash);
    expect(cmsThumbValue(image.url, image.alt)).toEqual({ url: image.url, alt: image.alt });
  });
  it('reuses the same stored choice on a retry, including reselecting an earlier image', async () => {
    const first = await prepareLivStoryImage(uid, input);
    await prepareLivStoryImage(uid, { ...input, url: 'https://museum.dk/second.png' });
    const again = await prepareLivStoryImage(uid, input);
    expect(again.id).toBe(first.id); expect(file).toHaveBeenCalledTimes(2); expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(rows.get(storyKey).article.selectedImage.id).toBe(first.id);
  });
  it('rejects another user, arbitrary URLs and missing metadata before fetching', async () => {
    await expect(prepareLivStoryImage('other-editor', input)).rejects.toThrow('draft_missing');
    await expect(prepareLivStoryImage(uid, { ...input, url: 'https://other.dk/secret.png' })).rejects.toThrow('not_in_research');
    await expect(prepareLivStoryImage(uid, { ...input, credit: '' })).rejects.toThrow('invalid');
    expect(mocks.read).not.toHaveBeenCalled(); expect(file).not.toHaveBeenCalled();
  });
  it('fails before network when no durable database/storage is configured', async () => {
    mocks.db = null;
    await expect(prepareLivStoryImage(uid, input)).rejects.toThrow('storage_unavailable'); expect(mocks.read).not.toHaveBeenCalled();
  });
  it('bounds new processing attempts while still permitting cached selections', async () => {
    const first = await prepareLivStoryImage(uid, input);
    rows.get(storyKey).mediaPreparationAttempts = Array(6).fill(Date.now());
    await expect(prepareLivStoryImage(uid, { ...input, credit: 'En anden kredit' })).rejects.toThrow('rate_limit');
    expect((await prepareLivStoryImage(uid, input)).id).toBe(first.id); expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it('clears stale image evidence when Writer finds or generates a replacement', () => {
    const original = normalizeArticleData({ featuredImage: input.url, featuredImageAlt: input.alt, featuredImageHash: 'old-proof', fotoCredit: input.credit });
    const changed = mergeArticleUpdate(original, { featuredImage: 'https://museum.dk/new.webp' });
    expect(changed.featuredImageAlt).toBeUndefined(); expect(changed.featuredImageHash).toBeUndefined(); expect(changed.fotoCredit).toBeUndefined();
    expect(mergeArticleUpdate(original, { title: 'Ny titel' }).featuredImageAlt).toBe(input.alt);
    expect(mergeArticleUpdate(original, { featuredImage: 'https://museum.dk/new.webp', featuredImageAlt: 'Ny alt-tekst' }).featuredImageAlt).toBe('Ny alt-tekst');
  });
  it('does not upscale a small source or treat a disguised SVG as a raster', async () => {
    mocks.read.mockResolvedValueOnce(await sharp({ create: { width: 640, height: 360, channels: 3, background: 'red' } }).png().toBuffer());
    await expect(prepareLivStoryImage(uid, input)).rejects.toThrow('prepare_failed');
    mocks.read.mockResolvedValueOnce(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1200"></svg>'));
    await expect(prepareLivStoryImage(uid, input)).rejects.toThrow('prepare_failed');
    expect(file).not.toHaveBeenCalled(); expect(rows.get(storyKey).article.selectedImage).toBeUndefined();
  });
  it('does not attach a corrupt storage readback', async () => {
    file.mockImplementation(() => ({ save: async () => {}, getMetadata: async () => [{ size: 1, contentType: 'image/webp' }], download: async () => [Buffer.from('x')] }));
    await expect(prepareLivStoryImage(uid, input)).rejects.toThrow('prepare_failed'); expect(rows.get(storyKey).article.selectedImage).toBeUndefined();
  });
  it('does not attach a result after the article changed during processing', async () => {
    mocks.read.mockImplementation(async () => { rows.get(storyKey).article.content = 'Ny artikel'; return original; });
    await expect(prepareLivStoryImage(uid, input)).rejects.toThrow('prepare_failed'); expect(rows.get(storyKey).article.selectedImage).toBeUndefined();
  });
  it('never lets an older in-flight selection overwrite a later explicit choice', async () => {
    let release!: (bytes: Buffer) => void;
    let started!: () => void;
    const startedPromise = new Promise<void>(resolve => { started = resolve; });
    mocks.read.mockImplementationOnce(() => new Promise<Buffer>(resolve => { release = resolve; started(); }));
    const first = prepareLivStoryImage(uid, input); const failure = expect(first).rejects.toThrow('prepare_failed');
    await startedPromise;
    await expect(prepareLivStoryImage(uid, input)).rejects.toThrow('already_processing');
    const newer = await prepareLivStoryImage(uid, { ...input, url: 'https://museum.dk/second.png' });
    release(original); await failure;
    expect(rows.get(storyKey).article.selectedImage.id).toBe(newer.id);
  });
  it('never silently promotes first search result or replaces a selected image in CMS', async () => {
    const discover = vi.fn().mockResolvedValue('https://museum.dk/unselected.png');
    const payload = buildLivCmsPayload({ article, topic: { title: 'Museet', score: 1 } });
    expect(payload.featuredImage).toBeUndefined();
    expect(await resolveCmsFeaturedImage(payload, ['https://museum.dk/article'], discover)).toBeNull();
    expect(await resolveCmsFeaturedImage({ ...payload, featuredImage: input.url }, ['https://museum.dk/article'], discover)).toBe(input.url);
    expect(discover).not.toHaveBeenCalled();
  });
  it('rejects stale article-bound metadata while keeping other authors image discovery', async () => {
    const image = await prepareLivStoryImage(uid, input);
    expect(() => buildLivCmsPayload({ article: { ...article, content: 'Ændret', selectedImage: image }, topic: { title: 'Museet', score: 1 } })).toThrow('article_changed');
    const payload = buildLivCmsPayload({ article, topic: { title: 'Museet', score: 1 } });
    const discover = vi.fn().mockResolvedValue(input.url);
    expect(await resolveCmsFeaturedImage({ ...payload, author: 'Frederik' }, ['https://museum.dk/article'], discover)).toBe(input.url);
  });
});
