import { load } from 'cheerio';

export const REVIEW_TYPOGRAPHY_RULE = 'Ingen lange tankestreger i anmeldelser: brug hverken en dash (U+2013) eller em dash (U+2014) i titel, undertitel, intro, brødtekst, billedtekster, SEO, metadata eller SoMe-tekst. Brug punktum, komma eller kolon; almindelige bindestreger i sammensatte ord er tilladt.';

/** Inspect visible text, including encoded entities, without changing prose or URLs. */
export function containsLongDash(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const $ = load(value);
  $('script,style').remove();
  return /[\u2013\u2014]/u.test($.root().text()) || $('img[alt]').toArray().some(el => /[\u2013\u2014]/u.test($(el).attr('alt') || ''));
}

export function isReviewText(article: Record<string, unknown>, kind?: string): boolean {
  return kind === 'review' || article.articleFormat === 'research-review' || typeof article.rating === 'number' ||
    /^(?:boganmeldelse|anmeldelse)\s*:/iu.test(String(article.title || ''));
}

export function reviewLongDashFields(article: Record<string, unknown>): string[] {
  const fields = ['title', 'subtitle', 'intro', 'content', 'excerpt', 'seoTitle', 'seoDescription', 'featuredImageAlt', 'fotoCredit', 'ratingReason'];
  const found = fields.filter(field => containsLongDash(article[field]));
  const social = article.socialSubtitles;
  if (social && typeof social === 'object') {
    for (const field of ['square', 'story']) if (containsLongDash((social as Record<string, unknown>)[field])) found.push(`socialSubtitles.${field}`);
  }
  return found;
}
