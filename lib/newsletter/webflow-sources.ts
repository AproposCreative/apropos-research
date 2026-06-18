import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';
import type { WeekRange } from '@/lib/newsletter/week-range';
import { getWebflowAuthors } from '@/lib/webflow-service';

export type NewsletterArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  thumbUrl: string | null;
  /**
   * Dato for ugens-udvælgelse + sortering: Webflow publicerings-/opdateringsfelter
   * (`lastPublished` → `lastUpdated` → `createdOn`) — aldrig CMS `publish-date`
   * (kan være event/SEO, fx festival).
   */
  selectionDate: string;
  /** Vist dato (live/tekst) — bruger systemfelter først, ellers `publish-date` i CMS. */
  lastPublished: string;
  url: string;
  /** Undertitel fra Webflow (som på sitet), til layout-test. */
  subtitle?: string | null;
  /** Antal stjerner fra feltet `stjerne` (typisk 1–6). */
  ratingStars?: number | null;
  /** Kategori-linje når section/topic ikke kun er Webflow-id (fx "Kultur | Anmeldelser"). */
  metaCategoryLine?: string | null;
  /** Webflow reference item-id (authors collection); bruges til at slå navn op. */
  authorItemId?: string | null;
  /** Vist navn efter opslag i authors collection. */
  authorName?: string | null;
};

/** Standard uddrag i liste-nyhedsbrev. */
export const NEWSLETTER_EXCERPT_MAX_DEFAULT = 220;
/** Længere brødtekst når custom-nyhedsbrev kun har én artikel. */
export const NEWSLETTER_EXCERPT_MAX_SINGLE_CUSTOM = 420;

function resolveThumbUrl(fieldData: Record<string, unknown>): string | null {
  const t = fieldData['mobile-image'] ?? fieldData.mobileImage ?? fieldData.thumb ?? fieldData['featured-image'];
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

function excerptFrom(fd: Record<string, unknown>, maxLen: number = NEWSLETTER_EXCERPT_MAX_DEFAULT): string {
  const ex = fd.excerpt;
  if (typeof ex === 'string' && ex.trim()) return stripHtml(ex).slice(0, maxLen);
  const intro = fd.intro;
  if (typeof intro === 'string' && intro.trim()) return stripHtml(intro).slice(0, maxLen);
  return '';
}

function authorItemIdFrom(fd: Record<string, unknown>): string | null {
  const a = fd.author ?? fd['article-author'];
  if (typeof a === 'string' && a.trim()) return a.trim();
  if (a && typeof a === 'object' && a !== null && 'id' in a) {
    const id = (a as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
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

function sortArticlesBySelectionDateDesc(list: NewsletterArticle[]): NewsletterArticle[] {
  return [...list].sort((a, b) => Date.parse(b.selectionDate) - Date.parse(a.selectionDate));
}

function mapItemToNewsletterArticle(
  it: any,
  base: string,
  excerptMaxLen: number = NEWSLETTER_EXCERPT_MAX_DEFAULT
): NewsletterArticle | null {
  if (it?.isDraft === true) return null;
  const fd = (it.fieldData || {}) as Record<string, unknown>;
  const createdOn = typeof it?.createdOn === 'string' ? it.createdOn : null;
  const publishDateField = typeof fd['publish-date'] === 'string' ? fd['publish-date'] : null;
  const lastPublished = typeof it?.lastPublished === 'string' ? it.lastPublished : null;
  const lastUpdated = typeof it?.lastUpdated === 'string' ? it.lastUpdated : null;
  /** Nyhedsbrev-vindue/sort: brug `createdOn` som primær kilde (redaktionel udgivelsesrækkefølge). */
  const selectionDate = createdOn || lastUpdated || lastPublished;
  const published = lastPublished || lastUpdated || createdOn || publishDateField;
  if (!selectionDate) return null;
  const name = typeof fd.name === 'string' ? fd.name : '';
  const slug = typeof fd.slug === 'string' ? fd.slug : '';
  if (!name || !slug) return null;
  return {
    id: String(it.id),
    title: name,
    slug,
    excerpt: excerptFrom(fd, excerptMaxLen),
    thumbUrl: resolveThumbUrl(fd),
    selectionDate,
    lastPublished: published,
    url: `${base}/articles/${slug}`,
    subtitle: subtitleFrom(fd),
    ratingStars: ratingStarsFrom(fd),
    metaCategoryLine: metaCategoryLineFrom(fd),
    authorItemId: authorItemIdFrom(fd),
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
): Promise<{
  articles: NewsletterArticle[];
  error?: string;
  minimumNote?: string;
  /** Rå antal i dato-vindue (før ekskludering) — diagnostik. */
  stats?: { inWindowCount: number; inWindowAfterExclude: number; maxPicked: number };
}> {
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
  allMapped.sort((a, b) => Date.parse(b.selectionDate) - Date.parse(a.selectionDate));

  /** Forrige ISO-uge fra `week` og frem til `referenceDate` (typisk «nu»), så nye artikler i indeværende uge kan med. */
  const inWindowRaw = allMapped.filter((a) => {
    const t = Date.parse(a.selectionDate);
    return !Number.isNaN(t) && t >= windowStartMs && t <= windowEndMs;
  });

  const excludeFull = options?.excludeIds;
  const excludeRelax = options?.relaxedExcludeIds;

  function pickWithExclude(excl: Set<string> | undefined): NewsletterArticle[] {
    const inWindow = excl?.size
      ? inWindowRaw.filter((a) => !excl.has(a.id))
      : [...inWindowRaw];
    let picked = sortArticlesBySelectionDateDesc(inWindow);
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
    picked = sortArticlesBySelectionDateDesc(picked);
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

  articles = sortArticlesBySelectionDateDesc(articles);
  if (articles.length > maxPick) {
    articles = articles.slice(0, maxPick);
  }

  if (min > 0) {
    if (inWindowRaw.length < min && articles.length >= min && !minimumNote) {
      minimumNote = `Kun ${inWindowRaw.length} artikel/artikler i vinduet (oprettet/opdateret i Webflow; fra forrige uges start til nu); listen er udfyldt til mindst ${min} med artikler uden for vinduet om nødvendigt.`;
    } else if (articles.length < min) {
      minimumNote = `Kun ${articles.length} artikel/artikler til rådighed (ønsket minimum ${min}).`;
    }
  }

  const inWindowAfterExclude = excludeFull?.size
    ? inWindowRaw.filter((a) => !excludeFull.has(a.id))
    : [...inWindowRaw];
  if (inWindowAfterExclude.length > maxPick) {
    const capNote = `I alt ${inWindowAfterExclude.length} artikler i dato-vinduet (efter standard-ekskludering), men højst ${maxPick} vises — de nyeste efter dato. En enkelt artikel kan mangle, fordi den er nummer 9+ i køen; vælg den i tilpasset nyhedsbrev.`;
    minimumNote = minimumNote ? `${minimumNote} ${capNote}` : capNote;
  }

  return {
    articles,
    error,
    minimumNote,
    stats: {
      inWindowCount: inWindowRaw.length,
      inWindowAfterExclude: inWindowAfterExclude.length,
      maxPicked: maxPick,
    },
  };
}

export type NewsletterArticleListItem = Pick<
  NewsletterArticle,
  'id' | 'title' | 'slug' | 'thumbUrl' | 'lastPublished'
>;

/**
 * Let liste til UI-picker: nyeste først, valgfri titel-søgning (server-side).
 */
export async function listNewsletterArticlesForPicker(params: {
  articleBaseUrl: string;
  /** Case-insensitive delstreng i titel */
  query?: string;
  limit?: number;
}): Promise<{ items: NewsletterArticleListItem[]; error?: string }> {
  const cfg = getWebflowConfig();
  const collectionId = cfg.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!collectionId) {
    return { items: [], error: 'WEBFLOW_ARTICLES_COLLECTION_ID er ikke sat' };
  }

  const { items, error } = await fetchAllCollectionItems(collectionId);
  if (error && items.length === 0) {
    return { items: [], error };
  }

  const base = params.articleBaseUrl.replace(/\/$/, '');
  const allMapped: NewsletterArticle[] = [];
  for (const it of items) {
    const a = mapItemToNewsletterArticle(it, base);
    if (a) allMapped.push(a);
  }
  allMapped.sort((a, b) => Date.parse(b.selectionDate) - Date.parse(a.selectionDate));

  const q = params.query?.trim().toLowerCase();
  const filtered = q
    ? allMapped.filter((a) => a.title.toLowerCase().includes(q))
    : allMapped;

  const lim = Math.min(Math.max(params.limit ?? 100, 1), 150);
  const slice = filtered.slice(0, lim);

  return {
    items: slice.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      thumbUrl: a.thumbUrl,
      lastPublished: a.lastPublished,
    })),
    error: error && slice.length === 0 ? error : undefined,
  };
}

export type ResolveArticlesByIdsResult = {
  articles: NewsletterArticle[];
  warnings: string[];
  error?: string;
};

/**
 * Slår forfatternavne op (én Webflow-runde). Bruges til custom enkeltartikel m.m.
 */
export async function enrichNewsletterArticlesWithAuthorNames(
  articles: NewsletterArticle[]
): Promise<NewsletterArticle[]> {
  if (articles.length === 0) return articles;
  const needLookup = articles.some((a) => a.authorItemId && !a.authorName);
  if (!needLookup) return articles;
  try {
    const authors = await getWebflowAuthors();
    const byId = new Map(authors.map((au) => [au.id, au.name]));
    return articles.map((a) => {
      const aid = a.authorItemId;
      if (!aid) return a;
      const name = byId.get(aid);
      return name ? { ...a, authorName: name } : a;
    });
  } catch {
    return articles;
  }
}

/**
 * Slår Webflow-artikler op og bevarer klientens rækkefølge. Mindst én gyldig kræves for send.
 */
export async function resolveArticlesByIdsOrdered(
  orderedIds: string[],
  articleBaseUrl: string,
  options?: { applyLongExcerptWhenSingleArticle?: boolean }
): Promise<ResolveArticlesByIdsResult> {
  const warnings: string[] = [];
  const raw = orderedIds.map((id) => String(id).trim()).filter(Boolean);
  if (raw.length === 0) {
    return { articles: [], warnings: [], error: 'Ingen artikel-id angivet' };
  }
  if (raw.length > MAX_NEWSLETTER_ARTICLES) {
    return {
      articles: [],
      warnings: [],
      error: `Vælg højst ${MAX_NEWSLETTER_ARTICLES} artikler`,
    };
  }

  const cfg = getWebflowConfig();
  const collectionId = cfg.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!collectionId) {
    return { articles: [], warnings: [], error: 'WEBFLOW_ARTICLES_COLLECTION_ID er ikke sat' };
  }

  const { items, error } = await fetchAllCollectionItems(collectionId);
  if (error && items.length === 0) {
    return { articles: [], warnings: [], error };
  }

  const base = articleBaseUrl.replace(/\/$/, '');
  const byId = new Map<string, NewsletterArticle>();
  const rawById = new Map<string, unknown>();
  for (const it of items) {
    const a = mapItemToNewsletterArticle(it, base);
    if (a) {
      byId.set(a.id, a);
      rawById.set(String((it as { id?: string }).id ?? a.id), it);
    }
  }

  const ordered: NewsletterArticle[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    const a = byId.get(id);
    if (a) {
      if (!seen.has(a.id)) {
        ordered.push(a);
        seen.add(a.id);
      }
    } else {
      warnings.push(`Kunne ikke finde artikel: ${id}`);
    }
  }

  if (ordered.length === 0) {
    return { articles: [], warnings, error: 'Ingen gyldige artikler' };
  }

  if (options?.applyLongExcerptWhenSingleArticle && ordered.length === 1) {
    const only = ordered[0]!;
    const raw = rawById.get(only.id);
    if (raw && typeof raw === 'object' && raw !== null && 'fieldData' in raw) {
      const fd = ((raw as { fieldData?: Record<string, unknown> }).fieldData || {}) as Record<string, unknown>;
      ordered[0] = {
        ...only,
        excerpt: excerptFrom(fd, NEWSLETTER_EXCERPT_MAX_SINGLE_CUSTOM),
      };
    }
  }

  return { articles: ordered, warnings };
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
