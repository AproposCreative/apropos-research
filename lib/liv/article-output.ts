import { z } from 'zod';
import type { LivArticleFormat } from './review-format';
import { createHash } from 'node:crypto';
import type { BlockedSourceReview } from './blocked-review';

export class ArticleEvidenceError extends Error {
  readonly code = 'article_evidence_insufficient';
  #review?: BlockedSourceReview;
  get blockedReview() { return this.#review; }
  constructor(readonly missingEvidence: string[]) {
    super('article_evidence_insufficient: Researchgrundlaget rækker endnu ikke til den ønskede artikel.');
    this.name = 'ArticleEvidenceError';
  }
  attachBrief(text: string, model: string, voiceVersion: string) {
    const review = `MANGLENDE BELÆG\n${this.missingEvidence.map(s => `- ${s}`).join('\n')}\n\nDEN BRIEF SKRIBENTEN MODTOG\n${text}`;
    this.#review = { status: 'blocked', kind: 'research', text: review, model, voiceVersion,
      textHash: createHash('sha256').update(review).digest('hex') };
  }
}

/** The provider owns JSON syntax; our validator still owns editorial acceptance. */
export const livArticleResponseFormat = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'liv_article_v1', strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['ready', 'insufficient_evidence'] },
        title: { type: 'string' }, subtitle: { type: 'string' },
        intro: { type: 'string' }, content: { type: 'string' },
        rating: { type: ['integer', 'null'], enum: [1, 2, 3, 4, 5, 6, null] },
        ratingReason: { type: ['string', 'null'] },
        missingEvidence: { type: 'array', items: { type: 'string' } },
      },
      required: ['status', 'title', 'subtitle', 'intro', 'content', 'rating', 'ratingReason', 'missingEvidence'],
    },
  },
};

const articleSchema = z.object({
  status: z.enum(['ready', 'insufficient_evidence']),
  title: z.string().trim().max(120), subtitle: z.string().trim().max(300),
  intro: z.string().trim().max(3000), content: z.string().trim().max(40000),
  rating: z.number().int().min(1).max(6).nullable(),
  ratingReason: z.string().trim().max(600).nullable(),
  missingEvidence: z.array(z.string().trim().min(5).max(500)).max(6).default([]),
}).strict();

export function parseLivArticleOutput(raw: string, format: LivArticleFormat) {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('article_output_invalid_json'); }
  const checked = articleSchema.safeParse(value);
  if (!checked.success) throw new Error('article_output_invalid_fields');
  const article = checked.data;
  // A schema must not force the model to manufacture a verdict when evidence is missing.
  if (article.status !== 'ready') throw new ArticleEvidenceError(article.missingEvidence.length
    ? article.missingEvidence : ['Modellen angav ikke, hvilke konkrete belæg der mangler.']);
  if (article.missingEvidence.length) throw new Error('article_output_conflicting_status');
  if (!article.title || !article.subtitle || !article.intro || !article.content) throw new Error('article_output_empty_fields');
  if (format === 'research-review') {
    if (article.rating === null || !article.ratingReason || article.ratingReason.length < 30) {
      throw new Error('research_rating_invalid: Stjerner kræver 1-6 og en konkret begrundelse.');
    }
  } else if (article.rating !== null || article.ratingReason !== null) {
    throw new Error('unexpected_article_rating');
  }
  return article;
}
