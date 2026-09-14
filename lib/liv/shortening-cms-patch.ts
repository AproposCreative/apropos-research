import { buildLivShorteningCandidate } from './shortening-candidate';
import { samePresentationBody } from './presentation-revision';
import { cmsFieldHash } from './cms-field-hash';
import type { GeneratedArticle } from './generate-article';
import type { WebflowArticleFields } from '@/lib/webflow/types';

/** Construct a draft-only patch from saved edits, never from client HTML.
 * The caller must independently enforce the human review, leases, journal and
 * readback. This helper grants no editorial or publication approval. */
export function buildLivShorteningCmsPatch(input: {
  article: GeneratedArticle;
  expected: WebflowArticleFields;
  cmsFields: Record<string, unknown>;
  targetWords: number;
  edits: unknown;
  reviewedCandidateHash: string;
  schemaSlugs: readonly string[];
}) {
  const { article, expected, cmsFields, targetWords, edits } = input;
  if (typeof cmsFields.content !== 'string' || cmsFields.name !== expected.title ||
    cmsFields.slug !== expected.slug || article.title !== expected.title ||
    !samePresentationBody(article.content, expected.content) ||
    !samePresentationBody(article.content, cmsFields.content))
    throw new Error('liv_shortening_checkpoint_changed');
  const candidate = buildLivShorteningCandidate(article, targetWords, edits);
  if (cmsFieldHash({ content: candidate.content }) !== input.reviewedCandidateHash)
    throw new Error('liv_shortening_review_changed');
  // Apply the same exact edits to actual CMS markup, not the original uploaded
  // HTML: Webflow's optimized image URLs and attributes must survive unchanged.
  const cmsCandidate = buildLivShorteningCandidate({ ...article, content: cmsFields.content }, targetWords, edits);
  if (!samePresentationBody(candidate.content, cmsCandidate.content) ||
    candidate.afterWords !== cmsCandidate.afterWords)
    throw new Error('liv_shortening_checkpoint_changed');
  if (!input.schemaSlugs.includes('content') || !input.schemaSlugs.includes('minutes-to-read'))
    throw new Error('liv_shortening_schema_changed');
  const readTime = Math.max(1, Math.ceil(candidate.afterWords / 200));
  const patch: Record<string, unknown> = { content: cmsCandidate.content, 'minutes-to-read': readTime };
  if (input.schemaSlugs.includes('word-count')) patch['word-count'] = candidate.afterWords;
  return { patch, expected: { ...expected, content: cmsCandidate.content,
    wordCount: candidate.afterWords, readTime },
    checkpointContent: candidate.content, publicationReady: false as const };
}
