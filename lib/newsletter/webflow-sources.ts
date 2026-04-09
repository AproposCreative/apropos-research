import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';
import type { WeekRange } from '@/lib/newsletter/week-range';

export type NewsletterArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  thumbUrl: string | null;
  lastPublished: string;
  url: string;
  /** Undertitel fra Webflow (som på sitet), til layout-test. */
  subtitle?: string | null;
  /** Antal stjerner fra feltet `stjerne` (typisk 1–6). */
  ratingStars?: number | null;
  /** Kategori-linje når section/topic ikke kun er Webflow-id (fx "Kultur | Anmeldelser"). */
  metaCategoryLine?: string | null;
};

function resolveThumbUrl(fieldData: Record<string, unknown>): string | null {
  const t = fieldData.thumb ?? fieldData['featured-image'];
  if (typeof t === 'string' && /^https?:\/\//i.test(t)) return t;
  if (t && typeof t === 'object' && t !== null && 'url' in t) {
    const u = (t as { url?: string }).url;
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
  }
  return null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function excerptFrom(fd: Record<string, unknown>): string {
  const ex = fd.excerpt;
  if (typeof ex === 'string' && ex.trim()) return stripHtml(ex).slice(0, 220);
  const intro = fd.intro;
  if (typeof intro === 'string' && intro.trim()) return stripHtml(intro).slice(0, 220);
  return '';
}

/** Webflow gemmer ofte references som 24-hex id; så viser vi ikke rå id i mail. */
function isLikelyWebflowItemId(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[0-9a-f]{24}$/i.test(t)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

function metaCategoryLineFrom(fd: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const sec = fd.section;
  const top = fd.topic;
  if (typeof sec === 'string' && sec.trim() && !isLikelyWebflowItemId(sec)) parts.push(sec.trim());
  if (typeof top === 'string' && top.trim() && !isLikelyWebflowItemId(top)) parts.push(top.trim());
  return parts.length ? parts.join(' | ') : null;
}

function ratingStarsFrom(fd: Record<string, unknown>): number | null {
  const raw = fd.stjerne;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n < 1 || n > 6) return null;
    return n;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = Math.round(Number.parseFloat(raw.replace(',', '.')));
    if (!Number.isFinite(n) || n < 1 || n > 6) return null;
    return n;
  }
  return null;
}

function subtitleFrom(fd: Record<string, unknown>): string | null {
  const sub = fd.subtitle;
  if (typeof sub === 'string' && sub.trim()) return stripHtml(sub).slice(0, 160);
  return null;
}

/** Sørg for mindst så mange artikler i nyhedsbrevet (udfylder med nyere uden for perioden om nødvendigt). */
export const MIN_NEWSLETTER_ARTICLES = 3;

/** Maks. antal artikler i mail og AI-intro (nyeste først efter sortering). */
export const MAX_NEWSLETTER_ARTICLES = 8;

function sortArticlesByPublishedDesc(list: NewsletterArticle[]): NewsletterArticle[] {
  return [...list].sort((a, b) => Date.parse(b.lastPublished) - Date.parse(a.lastPublished));
}

function mapItemToNewsletterArticle(it: any, base: string): NewsletterArticle | null {
  if (it?.isDraft === true) return null;
  const published = it?.lastPublished || it?.lastUpdated || it?.createdOn;
  if (!published || typeof published !== 'string') return null;
  const fd = (it.fieldData || {}) as Record<string, unknown>;
  const name = typeof fd.name === 'string' ? fd.name : '';
  const slug = typeof fd.slug === 'string' ? fd.slug : '';
  if (!name || !slug) return null;
  return {
    id: String(it.id),
    title: name,
    slug,
    excerpt: excerptFrom(fd),
    thumbUrl: resolveThumbUrl(fd),
    lastPublished: published,
    url: `${base}/articles/${slug}`,
    subtitle: subtitleFrom(fd),
    ratingStars: ratingStarsFrom(fd),
    metaCategoryLine: metaCategoryLineFrom(fd),
  };
}

async function fetchAllCollectionItems(collectionId: string): Promise<{ items: any[]; error?: string }> {
  const cfg = getWebflowConfig();
  const token = cfg.apiToken || env.WEBFLOW_API_TOKEN;
  const siteId = cfg.siteId || env.WEBFLOW_SITE_ID;
  if (!token || !siteId) {
    return { items: [], error: 'Manglende Webflow token eller site ID' };
  }

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;
  const pageSize = 100;
  const maxItems = 5000;
  let offset = 0;
  const items: any[] = [];

  while (offset < maxItems) {
    const url = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items?limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { items, error: (j as { message?: string }).message || `Webflow ${res.status}` };
    }
    const data: any = await res.json();
    const page = data.items || [];
    items.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return { items };
}

export async function fetchArticlesForWeek(
  week: WeekRange,
  articleBaseUrl: string,
  options?: {
    minimumArticles?: number;
    /** Ekskluder disse Webflow item-id'er (fx seneste auto-sends). */
    excludeIds?: Set<string>;
    /** Slækket ekskludering: kun seneste få sends — bruges hvis fuld ekskludering giver for få artikler. */
    relaxedExcludeIds?: Set<string>;
    /**
     * Øvre grænse for publicering i vinduet: typisk «nu», så indeværende ISO-uge (efter forrige uges start) kan med.
     * Underliggende vindue: fra `week.start` (start af forrige ISO-uge, UTC) og frem til denne dato.
     */
    referenceDate?: Date;
    /** Maks. artikler efter sortering (nyeste først). Standard MAX_NEWSLETTER_ARTICLES. */
    maxArticles?: number;
  }
): Promise<{ articles: NewsletterArticle[]; error?: string; minimumNote?: string }> {
  const cfg = getWebflowConfig();
  const collectionId = cfg.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!collectionId) {
    return { articles: [], error: 'WEBFLOW_ARTICLES_COLLECTION_ID er ikke sat' };
  }

  const { items, error } = await fetchAllCollectionItems(collectionId);
  if (error && items.length === 0) {
    return { articles: [], error };
  }

  const windowStartMs = week.start.getTime();
  const ref = options?.referenceDate ?? new Date();
  const windowEndMs = ref.getTime();
  const base = articleBaseUrl.replace(/\/$/, '');
  const min = options?.minimumArticles ?? 0;
  const maxPick = Math.max(min, options?.maxArticles ?? MAX_NEWSLETTER_ARTICLES);

  const allMapped: NewsletterArticle[] = [];
  for (const it of items) {
    const a = mapItemToNewsletterArticle(it, base);
    if (a) allMapped.push(a);
  }
  allMapped.sort((a, b) => Date.parse(b.lastPublished) - Date.parse(a.lastPublished));

  /** Forrige ISO-uge fra `week` og frem til `referenceDate` (typisk «nu»), så nye artikler i indeværende uge kan med. */
  const inWindowRaw = allMapped.filter((a) => {
    const t = Date.parse(a.lastPublished);
    return !Number.isNaN(t) && t >= windowStartMs && t <= windowEndMs;
  });

  const excludeFull = options?.excludeIds;
  const excludeRelax = options?.relaxedExcludeIds;

  function pickWithExclude(excl: Set<string> | undefined): NewsletterArticle[] {
    const inWindow = excl?.size
      ? inWindowRaw.filter((a) => !excl.has(a.id))
      : [...inWindowRaw];
    let picked = sortArticlesByPublishedDesc(inWindow);
    const seen = new Set(picked.map((a) => a.id));
    if (min > 0 && picked.length < min) {
      for (const a of allMapped) {
        if (picked.length >= min) break;
        if (seen.has(a.id)) continue;
        if (excl?.has(a.id)) continue;
        picked.push(a);
        seen.add(a.id);
      }
    }
    picked = sortArticlesByPublishedDesc(picked);
    if (picked.length > maxPick) {
      picked = picked.slice(0, maxPick);
    }
    return picked;
  }

  let articles = pickWithExclude(excludeFull);
  let minimumNote: string | undefined;
  const hadExclusion = Boolean(excludeFull && excludeFull.size > 0);

  if (min > 0 && articles.length < min && hadExclusion && excludeRelax && excludeRelax.size > 0) {
    const second = pickWithExclude(excludeRelax);
    if (second.length > articles.length) {
      articles = second;
      minimumNote =
        'Færre end ønsket antal artikler med fuld ekskludering af seneste auto-nyhedsbreve; kun de seneste ugers sendinger er undgået i dette udvalg.';
    }
  }

  if (min > 0 && articles.length < min && hadExclusion) {
    const none = pickWithExclude(undefined);
    if (none.length >= articles.length) {
      articles = none;
      minimumNote =
        'Artikler der tidligere har været i auto-nyhedsbrev kan være inkluderet igen, så nyhedsbrevet kan fyldes ud.';
    }
  }

  articles = sortArticlesByPublishedDesc(articles);
  if (articles.length > maxPick) {
    articles = articles.slice(0, maxPick);
  }

  if (min > 0) {
    if (inWindowRaw.length < min && articles.length >= min && !minimumNote) {
      minimumNote = `Kun ${inWindowRaw.length} artikel/artikler i vinduet (fra forrige uges start til nu); listen er udfyldt til mindst ${min} med ældre publiceringer om nødvendigt.`;
    } else if (articles.length < min) {
      minimumNote = `Kun ${articles.length} artikel/artikler til rådighed (ønsket minimum ${min}).`;
    }
  }

  return { articles, error, minimumNote };
}

export async function fetchNewsletterSignupEmails(
  collectionId: string | undefined,
  emailFieldSlug: string
): Promise<{ emails: string[]; error?: string }> {
  if (!collectionId?.trim()) {
    return { emails: [], error: 'WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID er ikke sat' };
  }

  const { items, error } = await fetchAllCollectionItems(collectionId.trim());
  if (error && items.length === 0) {
    return { emails: [], error };
  }

  const seen = new Set<string>();
  const emails: string[] = [];
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  for (const it of items) {
    const fd = (it.fieldData || {}) as Record<string, unknown>;
    const raw = fd[emailFieldSlug] ?? fd.email ?? fd.Email ?? fd['e-mail'];
    if (typeof raw !== 'string') continue;
    const e = raw.trim().toLowerCase();
    if (!re.test(e) || seen.has(e)) continue;
    seen.add(e);
    emails.push(e);
  }

  return { emails };
}

/**
 * Sletter alle CMS-items i signup-collection der matcher e-mail (case-insensitive).
 * Kræver Webflow token med skriveadgang til collection.
 */
export async function deleteNewsletterSignupByEmail(
  normalizedEmail: string,
  collectionId: string | undefined,
  emailFieldSlug: string
): Promise<{ deleted: number; error?: string }> {
  if (!collectionId?.trim()) {
    return { deleted: 0, error: 'WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID er ikke sat' };
  }
  const cfg = getWebflowConfig();
  const token = cfg.apiToken || env.WEBFLOW_API_TOKEN;
  if (!token) {
    return { deleted: 0, error: 'Webflow API token mangler' };
  }

  const { items, error } = await fetchAllCollectionItems(collectionId.trim());
  if (error && items.length === 0) {
    return { deleted: 0, error };
  }

  const target = normalizedEmail.trim().toLowerCase();
  const ids: string[] = [];
  for (const it of items) {
    const fd = (it.fieldData || {}) as Record<string, unknown>;
    const raw = fd[emailFieldSlug] ?? fd.email ?? fd.Email ?? fd['e-mail'];
    if (typeof raw !== 'string') continue;
    if (raw.trim().toLowerCase() === target) ids.push(String(it.id));
  }

  if (ids.length === 0) {
    return { deleted: 0 };
  }

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;
  const col = collectionId.trim();
  let deleted = 0;
  let lastErr: string | undefined;

  for (const itemId of ids) {
    const url = `https://api.webflow.com/v2/collections/${col}/items/${itemId}`;
    const res = await fetch(url, { method: 'DELETE', headers });
    if (res.ok || res.status === 204) {
      deleted++;
    } else {
      const j = await res.json().catch(() => ({}));
      lastErr = (j as { message?: string }).message || `Webflow ${res.status}`;
    }
  }

  if (deleted === 0 && lastErr) {
    return { deleted: 0, error: lastErr };
  }
  return { deleted };
}
