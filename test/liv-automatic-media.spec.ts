import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { load } from 'cheerio';
import { prepareLivAutomaticMedia, resolveLivMediaMode, validateLivMediaPlan, type MediaDependencies } from '@/lib/liv/automatic-media';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import type { GeneratedArticle } from '@/lib/liv/generate-article';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const article = { title: 'Kunst med tænder', slug: 'kunst-med-taender', intro: 'Kunst i byens park.', section: 'Kunst',
  content: Array.from({ length: 6 }, (_, i) => `<p>Afsnit ${i + 1}: kunsten fylder i byen.</p>`).join('') } as GeneratedArticle;
const plan = { images: Array.from({ length: 3 }, (_, i) => ({ candidateId: null, prompt: `En enkel original illustration af et kunstmotiv nummer ${i}.`,
  alt: `Tegnet parkmotiv nummer ${i}`, caption: `En fortolkning af kunsten i byen, motiv ${i}.` })) };
let originals: Buffer[];
let deps: MediaDependencies;
beforeAll(async () => {
  originals = await Promise.all(['#1350cc', '#ff3388', '#ffc600'].map(background => sharp({ create: { width: 2000, height: 1200, channels: 3, background } }).png().toBuffer()));
});
beforeEach(() => {
  deps = {
    claim: vi.fn(async () => null), record: vi.fn(async () => {}), candidates: vi.fn(async () => []),
    plan: vi.fn(async () => structuredClone(plan)), generate: vi.fn(async (_prompt, _id, role) => originals[['hero', 'body-1', 'body-2'].indexOf(role)]),
    store: vi.fn(async (id, role, bytes) => { const meta = await sharp(bytes).metadata(); return {
      url: `https://images.apropos.test/${id}/${role}.webp`, storagePath: `${id}/${role}.webp`, contentHash: hash(bytes),
      width: meta.width!, height: meta.height!, bytes: bytes.length,
    }; }),
    review: vi.fn(async () => true), complete: vi.fn(async () => {}), fail: vi.fn(async () => {}),
  };
});
describe('automatic Liv media', () => {
  it('prepares one hero and two distinct body images, preserving text order and aspect ratio', async () => {
    const result = await prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps);
    const $ = load(result.content);
    expect($('img')).toHaveLength(2);
    expect($('p').map((_, node) => $(node).text()).get()).toEqual(load(article.content)('p').map((_, node) => load(article.content)(node).text()).get());
    expect($('img').first().attr('style')).toContain('height:auto');
    expect(Number($('img').first().attr('width')) / Number($('img').first().attr('height'))).toBeCloseTo(2000 / 1200, 2);
    expect($('figcaption').text()).toContain('Illustration: Apropos Magazine / AI');
    expect(result.selectedImage).toMatchObject({ width: 1920, height: 1080, visualReview: 'automated', rightsStatus: 'unverified', articleHash: livImageArticleHash(result) });
    expect(result.selectedImage!.bytes).toBeLessThanOrEqual(450 * 1024);
    expect(new Set(result.preparedMedia!.map(image => image.contentHash)).size).toBe(3);
    expect(deps.generate).toHaveBeenCalledTimes(3);
    expect(deps.complete).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), result);
    expect(article.selectedImage).toBeUndefined();
    expect(article.content).not.toContain('<img');
  });
  it('selects only credited photography for reviews and does not call image generation', async () => {
    const candidates = originals.map((bytes, i) => ({ id: String(i), url: `https://press.test/${i}.png`, sourcePageUrl: 'https://press.test/film', credit: `Foto: Fotograf ${i} / Producent`, bytes }));
    vi.mocked(deps.candidates).mockResolvedValue(candidates);
    vi.mocked(deps.plan).mockResolvedValue({ images: plan.images.map((image, i) => ({ ...image, candidateId: String(i) })) });
    const result = await prepareLivAutomaticMedia({ ...article, articleFormat: 'research-review' }, { dayKey: '2026-09-10' }, deps);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(result.preparedMedia!.map(image => image.sourceUrl)).toEqual(candidates.map(candidate => candidate.url));
    expect(result.selectedImage?.credit).toBe(candidates[0].credit);
    expect(result.content).not.toContain('AI-illustration');
  });
  it('fails before paid calls when photos or their credits are missing', async () => {
    await expect(prepareLivAutomaticMedia({ ...article, section: 'Film' }, { dayKey: '2026-09-10' }, deps)).rejects.toThrow('credited_photos_missing');
    expect(deps.plan).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });
  it('rejects a documentary AI fallback for a film', () => {
    expect(() => resolveLivMediaMode({ ...article, section: 'Film' }, 'illustration')).toThrow('requires_photography');
  });
  it('rejects duplicated source bytes even if their URLs are different', async () => {
    vi.mocked(deps.generate).mockResolvedValue(originals[0]);
    await expect(prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps)).rejects.toThrow('duplicate');
    expect(deps.complete).not.toHaveBeenCalled();
  });
  it('retains asset records but never approves an image rejected by visual QA', async () => {
    vi.mocked(deps.review).mockResolvedValue(false);
    await expect(prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps)).rejects.toThrow('visual_check_failed');
    expect(deps.record).toHaveBeenCalledWith(expect.any(String), 'body-2', expect.objectContaining({ evidence: expect.any(Object) }));
    expect(deps.fail).toHaveBeenCalledTimes(1);
    expect(deps.complete).not.toHaveBeenCalled();
  });
  it('rejects mismatched uploaded bytes', async () => {
    vi.mocked(deps.store).mockResolvedValue({ url: 'https://images.test/wrong.webp', storagePath: 'wrong', bytes: 1, width: 1920, height: 1080, contentHash: 'wrong' });
    await expect(prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps)).rejects.toThrow('preparation_incomplete');
    expect(deps.review).not.toHaveBeenCalled();
  });
  it('reuses a completed job without another model call', async () => {
    const cached = { ...article, content: '<p>Saved revision</p>' };
    vi.mocked(deps.claim).mockResolvedValue(cached);
    expect(await prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps)).toBe(cached);
    expect(deps.plan).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it.each(['Only one paragraph', '<p>Text</p><img src="https://existing.test/a.png">'])('validates body structure before any claim or paid calls', async content => {
    await expect(prepareLivAutomaticMedia({ ...article, content }, { dayKey: '2026-09-10' }, deps)).rejects.toThrow('liv_media_');
    expect(deps.claim).not.toHaveBeenCalled();
  });
  it('does not replace existing prepared media or silently overwrite an edited revision', async () => {
    const result = await prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps);
    vi.mocked(deps.claim).mockClear();
    expect(await prepareLivAutomaticMedia(result, { dayKey: '2026-09-11' }, deps)).toBe(result);
    expect(deps.claim).not.toHaveBeenCalled();
    await expect(prepareLivAutomaticMedia({ ...result, title: 'Changed' }, { dayKey: '2026-09-10' }, deps)).rejects.toThrow('article_changed');
  });
  it('rejects markup in captions and unknown or duplicate candidate IDs', () => {
    expect(() => validateLivMediaPlan({ images: plan.images.map(image => ({ ...image, alt: '<script>alert(1)</script>' })) }, 'illustration', [])).toThrow('invalid');
    const candidate = { id: '1', url: 'https://press.test/a.png', sourcePageUrl: 'https://press.test', credit: 'Foto: Named', bytes: originals[0] };
    const photos = { images: plan.images.map(image => ({ ...image, candidateId: '1' })) };
    expect(() => validateLivMediaPlan(photos, 'photography', [candidate])).toThrow('candidate_invalid');
    expect(() => validateLivMediaPlan(photos, 'photography', [])).toThrow('candidate_invalid');
  });
});
