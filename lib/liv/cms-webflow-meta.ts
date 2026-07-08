/**
 * Kandidater til Webflow-emner + enkle tilvalg til CMS-felter (foto-credit, location),
 * så Liv-artikler ikke efterlader Primary Topic / Topics tomme når CMS-navne matcher.
 */

import type { GeneratedArticle } from '@/lib/liv/generate-article';
import type { PickedTopic } from '@/lib/liv/pick-topic';

/** Korte navne der typisk findes som Topics i Webflow — bruges som fallback efter tags. */
const FALLBACK_TOPIC_LABELS = ['Musik', 'Kultur', 'Festival', 'Danmark', 'Livet', 'Natteliv'];

/**
 * Byg en prioriteret liste af emnenavne til `topicsSelected` (API resolver hvert navn til item-id).
 * Rækkefølge: artikel-tags → emne-tags/kategori → heuristik fra titel → stabile fallback-navne.
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

  for (const t of article.tags || []) add(t);
  for (const t of topic.tags || []) add(t);
  if (topic.category) add(topic.category);

  const hay = `${topic.title} ${article.title} ${article.subtitle || ''}`.toLowerCase();
  if (/\b(festival|lineup|koncert|scene|headliner|heartland|roskilde|spotify)\b/i.test(hay)) {
    add('Musik');
    add('Festival');
  }
  if (/\b(kultur|film|teater|litteratur|museum|udstilling)\b/i.test(hay)) add('Kultur');
  if (/\b(mode|beauty|stil|makeup)\b/i.test(hay)) add('Mode');

  for (const f of FALLBACK_TOPIC_LABELS) add(f);

  return out.slice(0, 12);
}

export function fotoCreditFromFeaturedUrl(imageUrl: string | undefined | null): string | undefined {
  if (!imageUrl || typeof imageUrl !== 'string') return undefined;
  const u = imageUrl.trim();
  if (!/^https?:\/\//i.test(u)) return undefined;
  try {
    const host = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('heartlandfestival.dk')) return 'Heartland Festival';
    if (host.includes('roskilde-festival.dk')) return 'Roskilde Festival';
    return `Pressefoto · ${host}`;
  } catch {
    return undefined;
  }
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
