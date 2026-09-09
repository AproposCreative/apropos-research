export type LivArticleFormat = 'article' | 'research-review';

export function isLivArticleFormat(value: unknown): value is LivArticleFormat {
  return value === 'article' || value === 'research-review';
}

/** Rating is requested explicitly, never inferred from incidental words in the brief. */
export function parseResearchRating(raw: string, format: LivArticleFormat): { value: number; reason: string } | null {
  const ratings = [...raw.matchAll(/^\s*Rating\s*:\s*(.+)$/gim)];
  const reasons = [...raw.matchAll(/^\s*RatingReason\s*:\s*(.+)$/gim)];
  if (format === 'article') {
    if (ratings.length || reasons.length) throw new Error('unexpected_article_rating');
    return null;
  }
  const value = ratings[0]?.[1]?.trim();
  const reason = reasons[0]?.[1]?.trim() || '';
  if (ratings.length !== 1 || !/^[1-6]$/.test(value || '') || reasons.length !== 1 || reason.length < 30 || reason.length > 600) {
    throw new Error('research_rating_invalid: Stjerner kræver 1-6 og en konkret begrundelse.');
  }
  return { value: Number(value), reason };
}
