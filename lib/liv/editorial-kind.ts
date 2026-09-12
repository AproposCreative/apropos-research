/** Explicit editorial presentation metadata, never inferred from prose or used as CMS evidence. */
export const LIV_EDITORIAL_KINDS = ['feature', 'culture-story'] as const;
export type LivEditorialKind = typeof LIV_EDITORIAL_KINDS[number];
export const LIV_EDITORIAL_KIND_LABELS: Record<LivEditorialKind, string> = {
  feature: 'Feature', 'culture-story': 'Kulturhistorie',
};
export function isLivEditorialKind(value: unknown): value is LivEditorialKind {
  return value === 'feature' || value === 'culture-story';
}
export function editorialKindForArticle(value: unknown, articleFormat: unknown): LivEditorialKind | undefined {
  return articleFormat === 'article' && isLivEditorialKind(value) ? value : undefined;
}
