import { z } from 'zod';
import { load } from 'cheerio';
import { countLivBodyWords } from './article-length';
import type { GeneratedArticle } from './generate-article';

const text = (max: number) => z.string().trim().min(1).max(max).refine(s => !/[<>\x00-\x1f]/.test(s));
const url = z.string().url().max(2000).refine(s => new URL(s).protocol === 'https:');
/** Copy only. Callers cannot submit gate results, model evidence or CMS identities. */
export const suppliedArticleInput = z.object({
  title: text(200), subtitle: text(400), intro: text(2000),
  content: z.string().min(500).max(50000).refine(s => {
    const $ = load(s);
    return !/[\x00-\x08\x0b-\x1f]/.test(s) && $('*').toArray().every(el =>
      'tagName' in el && 'attribs' in el && ['html', 'head', 'body', 'p', 'h2', 'em', 'strong', 'br'].includes(el.tagName) && Object.keys(el.attribs || {}).length === 0) &&
      countLivBodyWords(s) >= 450 && countLivBodyWords(s) <= 3000;
  }),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  excerpt: text(500), section: text(80), tags: z.array(text(80)).min(1).max(12),
  seoTitle: text(150), seoDescription: text(400), primaryKeyword: text(150),
  rating: z.number().int().min(1).max(6), ratingReason: text(600),
  researchSources: z.array(z.object({ title: text(250), source: text(120), url,
    snippet: text(4000).optional(), publishedAt: z.string().datetime().optional() }).strict()).min(2).max(8),
  imageSuggestions: z.array(z.object({ url, source: text(200), title: text(250).optional(), sourcePageUrl: url }).strict()).max(12),
}).strict();

export function suppliedArticleCheckpoint(input: z.infer<typeof suppliedArticleInput>): GeneratedArticle {
  return { ...input, subjectType: 'literature', articleFormat: 'research-review', rawResponse: '', aiModel: 'human-editorial' };
}

/** Media insertion may reserialize HTML; prose and heading order may not change. */
export function assertSuppliedCopyPreserved(article: GeneratedArticle, original: z.infer<typeof suppliedArticleInput>) {
  const prose = (html: string) => {
    const $ = load(html); $('figure').remove(); $('p,h2,br').append(' ');
    return $('body').text().replace(/\s+/gu, ' ').trim();
  };
  if (['title', 'subtitle', 'intro', 'slug', 'excerpt', 'seoTitle', 'seoDescription', 'rating', 'ratingReason'].some(key =>
    article[key as keyof GeneratedArticle] !== original[key as keyof typeof original]) || prose(article.content) !== prose(original.content)) {
    throw new Error('liv_supplied_copy_changed');
  }
  return countLivBodyWords(original.content);
}
