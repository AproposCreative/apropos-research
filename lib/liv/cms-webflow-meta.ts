/**
 * Kandidater til Webflow-emner + enkle tilvalg til CMS-felter (foto-credit, location),
 * så Liv-artikler ikke efterlader Primary Topic / Topics tomme når CMS-navne matcher.
 */

import type { GeneratedArticle } from '@/lib/liv/generate-article';
import type { PickedTopic } from '@/lib/liv/pick-topic';

/**
 * Byg en prioriteret liste af emnenavne til `topicsSelected` (API resolver hvert navn til item-id).
 * Rækkefølge: eksplicit hovedemne → faktisk anmeldelsesformat → tags/kategori.
 */
export function buildTopicsSelectedForCms(topic: PickedTopic, article: GeneratedArticle): string[] {
  const out: string[] = [];
  const add = (s?: string | null) => {
    const t = (s || '').trim();
    if (!t) return;
    const lower = t.toLowerCase();
    if (out.some((x) => x.toLowerCase() === lower)) return;
    out.push(t);
  };

  if (article.subjectType === 'film') add('Film');
  if (article.subjectType === 'tv-series') add('TV-serier');
  if (article.articleFormat === 'research-review') add('Anmeldelser');

  const addCandidate = (value?: string) => {
    // Generated tags/categories cannot turn an analysis into a review.
    if (/^anmeldelse(?:r)?$/i.test(value?.trim() || '') && article.articleFormat !== 'research-review') return;
    add(value);
  };
  for (const t of article.tags || []) addCandidate(t);
  for (const t of topic.tags || []) addCandidate(t);
  addCandidate(topic.category);

  const hay = `${topic.title} ${article.title} ${article.subtitle || ''}`.toLowerCase();
  if (/\b(festival|festivalen|heartland|roskilde)\b/i.test(hay)) add('Festival');
  if (/\b(koncert|koncerter|koncerten|koncerterne)\b/i.test(hay)) add('Koncerter');
  if (/\b(kultur|film|teater|litteratur|museum|udstilling)\b/i.test(hay)) add('Kultur');
  if (/\b(mode|beauty|stil|makeup)\b/i.test(hay)) add('Mode');

  // Free-form tags need not exist in Webflow. Keep an actual broad CMS topic
  // after the explicit subject/format, including when the tag limit is reached.
  const selected = out.slice(0, 10);
  out.length = 0;
  selected.forEach(add);
  addCandidate(article.section);
  add('Kultur & Mening');
  return out;
}

export function fotoCreditFromFeaturedUrl(imageUrl: string | undefined | null): string | undefined {
  // A hostname establishes neither photographer identity nor a press licence.
  // Keep the legacy helper signature; verified credits must be supplied explicitly.
  void imageUrl;
  return undefined;
}

/** Kort stedlinje når vi kan udlede det fra indhold (fx festival på slot). */
export function suggestLocationLine(topic: PickedTopic, article: GeneratedArticle): string | undefined {
  const hay = `${topic.title}\n${article.title}\n${article.intro || ''}\n${article.content || ''}`
    .slice(0, 6000)
    .toLowerCase();
  if (hay.includes('egeskov') && hay.includes('heartland')) return 'Egeskov Slot, Danmark';
  if (hay.includes('heartland festival')) return 'Egeskov Slot, Danmark';
  return undefined;
}
