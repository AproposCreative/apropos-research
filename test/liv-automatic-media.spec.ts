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
  it('keeps native official 1200px photography without upscaling or misreporting selected dimensions', async () => {
    const candidates = await Promise.all(originals.map(async (bytes, i) => ({ id: String(i),
      url: `https://press.test/${i}.jpg`, sourcePageUrl: 'https://www.netflix.com/tudum/articles/the-gentlemen',
      credit: 'Foto: CHRISTOPHER RAPHAEL', bytes: await sharp(bytes).resize(1200, i ? 800 : 675).jpeg().toBuffer() })));
    vi.mocked(deps.candidates).mockResolvedValue(candidates);
    vi.mocked(deps.plan).mockResolvedValue({ images: plan.images.map((image, i) => ({ ...image, candidateId: String(i) })) });
    const result = await prepareLivAutomaticMedia({ ...article, section: 'Film' }, { dayKey: '2026-09-12' }, deps);
    expect(result.selectedImage).toMatchObject({ width: 1200, height: 675, rightsStatus: 'unverified', credit: candidates[0].credit });
    const heroBytes = vi.mocked(deps.store).mock.calls.find(call => call[1] === 'hero')![2];
    expect(await sharp(heroBytes).metadata()).toMatchObject({ width: 1200, height: 675, format: 'webp' });
    expect(result.selectedImage?.contentHash).toBe(hash(heroBytes));
    expect(deps.generate).not.toHaveBeenCalled();
    const stores = vi.mocked(deps.store).mock.calls;
    deps.resume = vi.fn(async () => result.preparedMedia!.map(evidence => ({ evidence, bytes: stores.find(call => call[1] === evidence.role)![2] })));
    vi.mocked(deps.plan).mockResolvedValue({ images: plan.images.map((image, i) => ({ ...image, candidateId: result.preparedMedia![i].sourceHash })) });
    vi.mocked(deps.store).mockClear();
    const resumed = await prepareLivAutomaticMedia({ ...article, section: 'Film' }, { dayKey: '2026-09-12' }, deps);
    expect(resumed.selectedImage).toMatchObject({ width: 1200, height: 675 });
    expect(deps.store).not.toHaveBeenCalled();
  });
  it.each(['film', 'tv-series'] as const)('uses explicit %s classification for press-photo selection even under the Kultur section', subjectType => {
    expect(resolveLivMediaMode({ ...article, section: 'Kultur', tags: [], subjectType })).toBe('photography');
    expect(() => resolveLivMediaMode({ ...article, section: 'Kultur', subjectType }, 'illustration')).toThrow('requires_photography');
  });
  it('prefers three official press stills for a culture feature without generating images', async () => {
    const suggestions = originals.map((_, i) => ({ url: `https://distribution.paradisbio.dk/${i}.jpg`,
      source: 'Øst for Paradis', sourcePageUrl: 'https://distribution.paradisbio.dk/film.asp?id=374' }));
    const candidates = originals.map((bytes, i) => ({ id: String(i), url: suggestions[i].url,
      sourcePageUrl: suggestions[i].sourcePageUrl, credit: 'Pressebillede: Øst for Paradis', bytes }));
    vi.mocked(deps.candidates).mockResolvedValue(candidates);
    vi.mocked(deps.plan).mockResolvedValue({ images: plan.images.map((image, i) => ({ ...image, candidateId: String(i) })) });
    const result = await prepareLivAutomaticMedia({ ...article, section: 'Kultur', imageSuggestions: suggestions }, { dayKey: '2026-09-12' }, deps);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(result.preparedMedia?.every(image => image.kind === 'photography')).toBe(true);
  });
  it('does not abandon paid illustrations when a new default discovers press material', async () => {
    const input = { ...article, imageSuggestions: [0, 1, 2].map(i => ({ url: `https://press.test/${i}.jpg`,
      source: 'Press', sourcePageUrl: 'https://a24films.com/film' })) };
    expect(resolveLivMediaMode(input)).toBe('photography');
    deps.existingMode = vi.fn(async () => 'illustration');
    const cached = { ...input, content: 'Saved paid text and media' };
    vi.mocked(deps.claim).mockResolvedValue(cached);
    expect(await prepareLivAutomaticMedia(input, { dayKey: '2026-09-12' }, deps)).toBe(cached);
    expect(deps.claim).toHaveBeenCalledWith(expect.any(String), input, 'illustration', 'expressive');
    expect(deps.plan).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });
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
  it('reuses saved encoded roles and only prepares roles that have no saved evidence', async () => {
    const completed = await prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps);
    const storedBytes = vi.mocked(deps.store).mock.calls;
    const hero = { evidence: completed.preparedMedia![0], bytes: storedBytes.find(call => call[1] === 'hero')![2] };
    deps.resume = vi.fn(async () => [hero]);
    vi.mocked(deps.generate).mockClear();
    vi.mocked(deps.store).mockClear();
    const resumed = await prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps);
    expect(resumed.preparedMedia![0]).toEqual(hero.evidence);
    expect(vi.mocked(deps.generate).mock.calls.map(call => call[2])).toEqual(['body-1', 'body-2']);
    expect(vi.mocked(deps.store).mock.calls.map(call => call[1]).sort()).toEqual(['body-1', 'body-2']);
    expect(deps.review).toHaveBeenLastCalledWith(article, 'illustration', expect.arrayContaining([
      { bytes: hero.bytes, alt: hero.evidence.alt, caption: hero.evidence.caption },
    ]), expect.any(String));
  });
  it('resumes saved photography without depending on source availability or replacing source credits', async () => {
    const input = { ...article, section: 'Film' };
    const candidates = originals.map((bytes, i) => ({ id: hash(bytes), url: `https://press.test/${i}.png`,
      sourcePageUrl: 'https://press.test/film', credit: `Foto: Fotograf ${i} / Producent`, bytes }));
    vi.mocked(deps.candidates).mockResolvedValue(candidates);
    vi.mocked(deps.plan).mockResolvedValue({ images: plan.images.map((image, i) => ({ ...image, candidateId: candidates[i].id })) });
    const completed = await prepareLivAutomaticMedia(input, { dayKey: '2026-09-10' }, deps);
    const storedBytes = vi.mocked(deps.store).mock.calls;
    deps.resume = vi.fn(async () => completed.preparedMedia!.map(evidence => ({ evidence,
      bytes: storedBytes.find(call => call[1] === evidence.role)![2] })));
    vi.mocked(deps.candidates).mockClear().mockRejectedValue(new Error('Source unavailable'));
    vi.mocked(deps.store).mockClear();
    const resumed = await prepareLivAutomaticMedia(input, { dayKey: '2026-09-10' }, deps);
    expect(resumed.preparedMedia).toEqual(completed.preparedMedia);
    expect(deps.candidates).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
    expect(deps.review).toHaveBeenCalledTimes(2);
  });
  it('rejects saved evidence that does not match its plan and still applies the duplicate gate', async () => {
    const completed = await prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps);
    const storedBytes = vi.mocked(deps.store).mock.calls;
    const saved = completed.preparedMedia!.map(evidence => ({ evidence: { ...evidence },
      bytes: storedBytes.find(call => call[1] === evidence.role)![2] }));
    deps.resume = vi.fn(async () => saved);
    vi.mocked(deps.review).mockClear();
    saved[0].evidence.alt = 'En anden billedtekst';
    await expect(prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps)).rejects.toThrow('preparation_incomplete');
    saved[0].evidence.alt = completed.preparedMedia![0].alt;
    saved[1].evidence.sourceHash = saved[0].evidence.sourceHash;
    await expect(prepareLivAutomaticMedia(article, { dayKey: '2026-09-10' }, deps)).rejects.toThrow('duplicate');
    expect(deps.review).not.toHaveBeenCalled();
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
