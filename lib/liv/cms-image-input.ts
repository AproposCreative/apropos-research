import type { WebflowArticleFields } from '@/lib/webflow/types';

/** Explicit choices win. Liv suggestions are not selected/licensed assets. */
export async function resolveCmsFeaturedImage(article: WebflowArticleFields, sourceUrls: string[], discover: (urls: string[]) => Promise<string | null>) {
  if (article.featuredImage?.trim()) return article.featuredImage.trim();
  if (/^liv(?:[ -]brandt)?$/i.test(article.author.trim())) return null;
  return sourceUrls.length ? discover(sourceUrls) : null;
}

export function cmsThumbValue(url: string, alt?: string) {
  return alt?.trim() ? { url, alt: alt.trim() } : url;
}
