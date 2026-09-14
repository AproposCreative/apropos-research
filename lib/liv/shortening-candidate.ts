import { z } from 'zod';
import { checkLivArticleLength, countLivBodyWords, LIV_DAILY_BODY_LENGTH } from './article-length';
import { applyLivParagraphEdits } from './paragraph-edits';
import type { GeneratedArticle } from './generate-article';

const candidate = z.object({ bodyEdits: z.array(z.object({
  index: z.number().int().nonnegative(), before: z.string().max(6000), after: z.string().max(6000),
}).strict()).min(1).max(60) }).strict();

/** Validates a proposed shortening only. No CMS write, proof rebinding, AI call,
 * research or publication. Existing editorial evidence must not approve new prose. */
export function buildLivShorteningCandidate(article: GeneratedArticle, targetWords: number, value: unknown) {
  const beforeWords = countLivBodyWords(article.content);
  if (!Number.isInteger(targetWords) || targetWords < LIV_DAILY_BODY_LENGTH.min ||
    targetWords > LIV_DAILY_BODY_LENGTH.max || targetWords >= beforeWords) throw new Error('liv_shortening_target_invalid');
  const parsed = candidate.safeParse(value);
  if (!parsed.success) throw new Error('liv_shortening_candidate_invalid');
  // A shortening request cannot expand another paragraph or edit metadata.
  if (parsed.data.bodyEdits.some(edit => countLivBodyWords(edit.after) >= countLivBodyWords(edit.before)))
    throw new Error('liv_shortening_not_shorter');
  const content = applyLivParagraphEdits(article.content, parsed.data.bodyEdits);
  const length = checkLivArticleLength(content);
  if (!length.pass || length.wordCount > targetWords || length.wordCount >= beforeWords)
    throw new Error('liv_shortening_length_failed');
  // Return only changed prose, not an apparently approved GeneratedArticle with
  // stale media/article hash or previously passed editorial checks attached.
  return { content, beforeWords, afterWords: length.wordCount, targetWords,
    publicationReady: false as const, editorialReviewRequired: true as const };
}
