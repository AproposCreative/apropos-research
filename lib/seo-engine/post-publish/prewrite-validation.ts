import { containsLongDash, isReviewText } from '@/lib/editorial/review-typography';
import type { Metadata } from './policy';

type ReviewProfile = { editorialTitle?: string; rating?: number; articleType?: string };

/** The same rule applies before saving a proposal and immediately before CMS transport. */
export function assertReviewMetadataTypography(article: ReviewProfile, patch: Partial<Metadata>) {
  if (isReviewText({ title: article.editorialTitle, rating: article.rating }, article.articleType) &&
      Object.values(patch).some(containsLongDash)) throw Error('seo_review_long_dash_forbidden');
}

/** These failures require a corrected proposal, not retrying an identical write. */
export function isDeterministicSeoPrewriteError(reason: unknown): boolean {
  return typeof reason === 'string' && ['seo_review_long_dash_forbidden', 'seo_metadata_duplicate',
    'seo_chat_invalid_candidate'].includes(reason);
}
