import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { load } from 'cheerio';
import { encodeWebp } from '@/lib/images/encode-webp';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { isLivOfficialImageSource } from '@/lib/liv/photo-credit';
import { chooseLivHeroDimensions, isLivHeroDimensions } from './hero-dimensions';

export type MediaMode = 'illustration' | 'photography';
export type MediaStyle = 'expressive' | 'minimal';
export type MediaCandidate = { id: string; url: string; sourcePageUrl: string; credit: string; bytes: Buffer };
export type MediaPlan = { images: Array<{ candidateId: string | null; prompt: string; alt: string; caption: string }> };
export type StoredMedia = { url: string; storagePath: string; contentHash: string; width: number; height: number; bytes: number };
export type MediaEvidence = StoredMedia & { role: 'hero' | 'body-1' | 'body-2'; alt: string; caption: string;
  credit: string; sourceUrl: string | null; sourcePageUrl: string | null; sourceHash: string; kind: MediaMode };
export type MediaOptions = { dayKey: string; mode?: MediaMode; style?: MediaStyle; deadline?: number };
export type MediaDependencies = {
  /** Preserve an already-paid job if a new default would choose another mode. */
  existingMode?: (jobIds: Record<MediaMode, string>) => Promise<MediaMode | null>;
  claim: (jobId: string, article: GeneratedArticle, mode: MediaMode, style: MediaStyle) => Promise<GeneratedArticle | null>;
  resume?: (jobId: string) => Promise<Array<{ evidence: MediaEvidence; bytes: Buffer }>>;
  record: (jobId: string, stage: string, data: Record<string, unknown>) => Promise<void>;
  candidates: (article: GeneratedArticle) => Promise<MediaCandidate[]>;
  plan: (article: GeneratedArticle, mode: MediaMode, style: MediaStyle, candidates: MediaCandidate[], jobId: string) => Promise<unknown>;
  generate: (prompt: string, jobId: string, role: string) => Promise<Buffer>;
  store: (jobId: string, role: string, bytes: Buffer) => Promise<StoredMedia>;
  review: (article: GeneratedArticle, mode: MediaMode, images: Array<{ bytes: Buffer; alt: string; caption: string }>, jobId: string) => Promise<boolean>;
  complete: (jobId: string, article: GeneratedArticle) => Promise<void>;
  fail: (jobId: string) => Promise<void>;
};
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const cleanText = (value: unknown, min: number, max: number) => typeof value === 'string' &&
  value.trim().length >= min && value.length <= max && !/[<>\x00-\x1f]/.test(value);
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function resolveLivMediaMode(article: GeneratedArticle, requested?: MediaMode): MediaMode {
  // Reviews and film/TV content must not acquire invented documentary imagery.
  const realImages = article.articleFormat === 'research-review' || ['film', 'tv-series'].includes(article.subjectType || '') ||
    /\b(?:film|serie|serier|tv|biograf)\b/i.test([article.section, ...(article.tags || [])].join(' '));
  if (realImages && requested === 'illustration') throw new Error('liv_media_review_requires_photography');
  const officialStills = new Set((article.imageSuggestions || []).filter(image =>
    isLivOfficialImageSource(image.sourcePageUrl || '')).map(image => image.url));
  return realImages ? 'photography' : requested || (officialStills.size >= 3 ? 'photography' : 'illustration');
}

export function validateLivMediaPlan(value: unknown, mode: MediaMode, candidates: MediaCandidate[]): MediaPlan {
  const images = (value as MediaPlan | null)?.images;
  if (!Array.isArray(images) || images.length !== 3) throw new Error('liv_media_plan_invalid');
  const selected = new Set<string>();
  for (const image of images) {
    if (!image || !cleanText(image.alt, 10, 240) || !cleanText(image.caption, 10, 350)) throw new Error('liv_media_plan_invalid');
    if (mode === 'photography') {
      const candidate = candidates.find(candidate => candidate.id === image.candidateId);
      if (!candidate || !candidate.credit.trim() || selected.has(candidate.id)) throw new Error('liv_media_candidate_invalid');
      selected.add(candidate.id);
    } else if (image.candidateId !== null || !cleanText(image.prompt, 30, 2500)) throw new Error('liv_media_plan_invalid');
  }
  return { images: images.map(image => ({ candidateId: image.candidateId, prompt: mode === 'photography' ? '' : image.prompt,
    alt: image.alt.trim(), caption: image.caption.trim() })) };
}

/** Insert at distinct paragraph breaks; keep text order and do not stretch images. */
function bodyDocument(content: string) {
  const html = /<\w+\b/.test(content) ? content : content.split(/\n\s*\n/).filter(Boolean)
    .map(paragraph => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('\n');
  const $ = load(html);
  // Never silently remove an editor's existing imagery.
  if ($('img,figure,picture').length) throw new Error('liv_media_existing_body_images');
  const paragraphs = $('p').toArray().filter(node => !$(node).parents('blockquote,table,li').length);
  if (paragraphs.length < 3) throw new Error('liv_media_body_structure');
  return { $, paragraphs };
}

export function insertLivBodyMedia(content: string, images: MediaEvidence[]): string {
  const bodyImages = images.filter(image => image.role !== 'hero');
  if (bodyImages.length !== 2) throw new Error('liv_media_body_count');
  const { $, paragraphs } = bodyDocument(content);
  const breaks = [Math.floor(paragraphs.length / 3), Math.floor(2 * paragraphs.length / 3)];
  bodyImages.forEach((image, index) => {
    const credit = /^(?:foto|illustration|kilde|credit)\s*:|^©/i.test(image.credit) ? image.credit : `Foto: ${image.credit}`;
    $(paragraphs[breaks[index]]).after(`<figure data-liv-media="${image.role}"><img src="${escape(image.url)}" alt="${escape(image.alt)}" width="${image.width}" height="${image.height}" style="max-width:100%;height:auto" loading="lazy"><figcaption>${escape(image.caption)} ${escape(credit)}</figcaption></figure>`);
  });
  return $('body').html() || $.html();
}

/** Prepares all three images before CMS publication. Does not call Webflow. */
export async function prepareLivAutomaticMedia(article: GeneratedArticle, options: MediaOptions, dependencies?: MediaDependencies): Promise<GeneratedArticle> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.dayKey)) throw new Error('liv_media_day_invalid');
  if (article.selectedImage?.editorialEdit) {
    return (await import('./editorial-edit-media-review')).reviewLivEditorialEditMedia(article, options.dayKey);
  }
  if (article.selectedImage && load(article.content)('img').length >= 2) {
    if (article.selectedImage.articleHash !== livImageArticleHash(article)) throw new Error('image_article_changed');
    return article; // Explicit prepared media wins; CMS byte/readback gates still apply.
  }
  if (article.selectedImage) throw new Error('liv_media_existing_hero');
  bodyDocument(article.content); // Fail before claiming or making paid calls.
  let mode = resolveLivMediaMode(article, options.mode);
  const style = options.style || 'expressive';
  if (!['expressive', 'minimal'].includes(style)) throw new Error('liv_media_style_invalid');
  const deps = dependencies ?? (await import('@/lib/liv/automatic-media-runtime')).livMediaRuntime(options.deadline);
  const jobIds = Object.fromEntries((['illustration', 'photography'] as const).map(value =>
    [value, digest(JSON.stringify(['liv-media-v1', options.dayKey, livImageArticleHash(article), value, style]))])) as Record<MediaMode, string>;
  if (!options.mode && deps.existingMode) {
    const existing = await deps.existingMode(jobIds);
    if (existing) {
      // Saved work wins over changing defaults, except a forbidden review image.
      mode = resolveLivMediaMode(article, existing);
    }
  }
  const jobId = jobIds[mode];
  const cached = await deps.claim(jobId, article, mode, style);
  if (cached) return cached;
  try {
    const saved = await deps.resume?.(jobId) ?? [];
    const candidates = mode === 'photography' ? [
      ...saved.map(({ evidence, bytes }) => ({ id: evidence.sourceHash, url: evidence.sourceUrl!,
        sourcePageUrl: evidence.sourcePageUrl!, credit: evidence.credit, bytes })),
      ...(saved.length < 3 ? await deps.candidates(article) : []),
    ].filter((candidate, index, all) => all.findIndex(item => item.id === candidate.id) === index) : [];
    if (mode === 'photography' && candidates.length < 3) throw new Error('liv_media_credited_photos_missing');
    const plan = validateLivMediaPlan(await deps.plan(article, mode, style, candidates, jobId), mode, candidates);
    await deps.record(jobId, 'plan', { plan });
    // Three fixed roles bound cost and prevent endless "try another image" loops.
    const results = await Promise.allSettled(plan.images.map(async (image, index) => {
      const role = (['hero', 'body-1', 'body-2'] as const)[index];
      const existing = saved.find(item => item.evidence.role === role);
      if (existing) {
        const caption = mode === 'illustration' ? `AI-illustration: ${image.caption}` : image.caption;
        if (existing.evidence.kind !== mode || existing.evidence.alt !== image.alt || existing.evidence.caption !== caption ||
            (mode === 'photography' && existing.evidence.sourceHash !== image.candidateId)) throw new Error('liv_media_saved_evidence_invalid');
        return existing;
      }
      const candidate = candidates.find(candidate => candidate.id === image.candidateId);
      const original = mode === 'photography' ? candidate!.bytes : await deps.generate(image.prompt, jobId, role);
      const meta = await sharp(original, { limitInputPixels: 80_000_000 }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height ||
          meta.width < 800 || meta.height < 500) throw new Error('liv_media_source_invalid');
      const heroDimensions = mode === 'photography' ? chooseLivHeroDimensions(meta.width, meta.height, meta.orientation) : { width: 1920, height: 1080 };
      if (index === 0 && !heroDimensions) throw new Error('liv_media_source_invalid');
      const encoded = await encodeWebp(original, { maxSizeKB: 450, maxLongEdge: 1920, qualityStart: 85, qualityMin: 55,
        effort: 4, ...(index === 0 ? { targetDimensions: heroDimensions! } : {}) });
      const stored = await deps.store(jobId, role, encoded.data);
      if (stored.contentHash !== digest(encoded.data) || stored.bytes !== encoded.bytes ||
          stored.width !== encoded.width || stored.height !== encoded.height || !/^https:\/\//.test(stored.url)) throw new Error('liv_media_storage_mismatch');
      const evidence: MediaEvidence = { ...stored, role, alt: image.alt,
        caption: mode === 'illustration' ? `AI-illustration: ${image.caption}` : image.caption,
        credit: mode === 'illustration' ? 'Illustration: Apropos Magazine / AI' : candidate!.credit,
        sourceUrl: candidate?.url || null, sourcePageUrl: candidate?.sourcePageUrl || null,
        sourceHash: digest(original), kind: mode };
      await deps.record(jobId, role, { evidence });
      return { evidence, bytes: encoded.data };
    }));
    if (results.some(result => result.status === 'rejected')) throw new Error('liv_media_preparation_incomplete');
    const prepared = results.map(result => (result as PromiseFulfilledResult<{ evidence: MediaEvidence; bytes: Buffer }>).value);
    if (new Set(prepared.map(item => item.evidence.sourceHash)).size !== 3 ||
        new Set(prepared.map(item => item.evidence.contentHash)).size !== 3) throw new Error('liv_media_duplicate');
    const approved = await deps.review(article, mode, prepared.map(item => ({ bytes: item.bytes,
      alt: item.evidence.alt, caption: item.evidence.caption })), jobId);
    if (!approved) throw new Error('liv_media_visual_check_failed');
    const media = prepared.map(item => item.evidence);
    const result: GeneratedArticle = { ...article, content: insertLivBodyMedia(article.content, media), preparedMedia: media };
    const hero = media[0];
    if (!isLivHeroDimensions(hero)) throw new Error('liv_media_saved_evidence_invalid');
    result.selectedImage = { id: `${jobId}-hero`, articleHash: livImageArticleHash(result), url: hero.url,
      storagePath: hero.storagePath, sourceUrl: hero.sourceUrl || hero.url, sourcePageUrl: hero.sourcePageUrl,
      contentHash: hero.contentHash, sourceHash: hero.sourceHash, ...({ width: hero.width, height: hero.height } as import('./hero-dimensions').LivHeroDimensions), bytes: hero.bytes,
      alt: hero.alt, credit: hero.credit, createdAt: new Date().toISOString(), rightsStatus: 'unverified', visualReview: 'automated' };
    await deps.complete(jobId, result);
    return result;
  } catch (error) {
    await deps.fail(jobId).catch(() => {});
    // Keep uploaded images and generation records; no blind paid retries.
    throw new Error(error instanceof Error && /^liv_media_[a-z_]+$/.test(error.message) ? error.message : 'liv_media_failed');
  }
}
