/**
 * Read-only SEO + GEO/AEO archive audit.
 *
 * Joins published Webflow locales with GA4 page metrics and optional GSC
 * page/query rows (sampled/top — not a complete corpus). Segments by type,
 * language, age, and freshness. Never writes CMS. Apply/overwrite is out of
 * scope — batch selection is for human review only.
 */

import { getCmsSeoSlugs, isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
import { checkReviewSeoTitle, isReviewSeoArticleType } from '@/lib/seo-engine/review-title-rule';
import { stripHtmlToText } from '@/lib/seo-engine/html-text';
import {
  defaultGa4Fetch,
  defaultGscFetch,
  type SearchSignalsProvenance,
} from '@/lib/seo-engine/search-signals';
import { getGa4AccessToken } from '@/lib/ga4/google-auth';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';
import { getConfiguredGscSiteUrl, getGscAccessToken } from '@/lib/gsc/google-auth';
import { listDkArticleItems, type ListedArticleItem } from '@/lib/seo-engine/overwrite-backfill';
import {
  fetchArticleItemByLocale,
  resolveWebflowLocaleIds,
  isWebflowLocalePublished,
} from '@/lib/webflow/locale-items';

export type ArchiveAuditLocale = 'da' | 'en';

export type ArchiveAuditFindingCode =
  | 'missing_seo_title'
  | 'missing_meta_description'
  | 'review_title_keyword_missing'
  | 'duplicate_seo_title'
  | 'short_meta'
  | 'weak_seo_title'
  | 'missing_author'
  | 'thin_intro'
  | 'thin_content'
  | 'weak_heading_structure'
  | 'missing_image_alt'
  | 'few_internal_links'
  | 'stale_content'
  | 'missing_explicit_canonical'
  | 'geo_author_date_gap'
  | 'geo_answerability_gap'
  | 'locale_pair_missing'
  | 'unpublished'
  | 'fetch_error';

export type ArchiveAuditPriority = 'P0' | 'P1' | 'P2' | 'ok';

export type ArchiveAuditWinClass = 'quick_win' | 'strategic' | 'monitor' | 'ok';

export type ArchiveAgeBucket = '0-30d' | '31-90d' | '91-365d' | '1y+';
export type ArchiveFreshness = 'fresh' | 'aging' | 'stale' | 'unknown';

export type ArchiveAuditFinding = {
  code: ArchiveAuditFindingCode;
  message: string;
  priority: ArchiveAuditPriority;
  evidence?: string;
  /** Honest GEO/AEO rule tag — never claims secret ranking factors. */
  geoAeo?: boolean;
};

export type ArchiveAuditRow = {
  itemId: string;
  locale: ArchiveAuditLocale;
  cmsLocaleId: string;
  slug: string;
  title: string;
  seoTitle: string;
  metaDescription: string;
  published: boolean;
  lastPublished: string | null;
  lastUpdated: string | null;
  articleTypeHint: string;
  canonicalUrl: string | null;
  explicitCanonical: boolean;
  ageBucket: ArchiveAgeBucket;
  freshness: ArchiveFreshness;
  ageDays: number | null;
  findings: ArchiveAuditFinding[];
  priority: ArchiveAuditPriority;
  winClass: ArchiveAuditWinClass;
  gscPageMatched: boolean;
  gscTopQuery: string | null;
  gscClicks: number | null;
  gscImpressions: number | null;
  gscCtr: number | null;
  gscAvgPosition: number | null;
  ga4PageMatched: boolean;
  ga4PageViews: number | null;
  ga4EngagedSessions: number | null;
  wordCount: number | null;
  headingCount: number | null;
  internalLinkCount: number | null;
  hasAuthor: boolean;
  hasIntro: boolean;
  siblingLocalePresent: boolean | null;
};

export type ArchiveAuditSegmentKey = string;

export type ArchiveAuditSegmentSummary = {
  key: ArchiveAuditSegmentKey;
  articleType: string;
  locale: ArchiveAuditLocale | 'all';
  ageBucket: ArchiveAgeBucket | 'all';
  freshness: ArchiveFreshness | 'all';
  count: number;
  p0: number;
  p1: number;
  medianGa4Views: number | null;
  medianGscClicks: number | null;
};

export type ArchiveAuditPatternNote = {
  id: string;
  observation: string;
  /** Explicitly not causation. */
  caveat: string;
  sampleSize: number;
};

export type ArchiveAuditReport = {
  schemaVersion: 2;
  kind: 'archive-audit';
  mode: 'read-only';
  createdAt: string;
  measurementWindowDays: number;
  locales: ArchiveAuditLocale[];
  limit: number;
  scanned: number;
  summary: {
    p0: number;
    p1: number;
    p2: number;
    ok: number;
    fetchErrors: number;
    gscJoinHits: number;
    ga4JoinHits: number;
    quickWins: number;
    strategic: number;
  };
  segments: ArchiveAuditSegmentSummary[];
  patterns: ArchiveAuditPatternNote[];
  gscProvenance: SearchSignalsProvenance | null;
  ga4Provenance: {
    available: boolean;
    setupStatus: string;
    rowCount: number;
  } | null;
  note: string;
  rows: ArchiveAuditRow[];
};

export type Ga4PageMetric = {
  pagePath: string;
  pageViews: number;
  engagedSessions: number;
};

export type GscPageMetric = {
  page: string;
  query: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number | null;
};

export type ArchiveAuditDeps = {
  listFn?: () => Promise<ListedArticleItem[]>;
  fetchFn?: typeof fetchArticleItemByLocale;
  now?: () => number;
  gscByPage?: Map<string, GscPageMetric>;
  ga4ByPath?: Map<string, Ga4PageMetric>;
  skipGsc?: boolean;
  skipGa4?: boolean;
  /** Injected loaders (tests). */
  loadGscFn?: (days: number) => Promise<{
    byPage: Map<string, GscPageMetric>;
    provenance: SearchSignalsProvenance | null;
  }>;
  loadGa4Fn?: (days: number) => Promise<{
    byPath: Map<string, Ga4PageMetric>;
    provenance: ArchiveAuditReport['ga4Provenance'];
  }>;
};

const PRIORITY_RANK: Record<ArchiveAuditPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  ok: 3,
};

const SITE_ORIGIN = 'https://www.aproposmagazine.com';

function worstPriority(findings: ArchiveAuditFinding[]): ArchiveAuditPriority {
  if (findings.length === 0) return 'ok';
  return findings.reduce(
    (worst, f) => (PRIORITY_RANK[f.priority] < PRIORITY_RANK[worst] ? f.priority : worst),
    'ok' as ArchiveAuditPriority
  );
}

export function inferArticleTypeHint(slug: string, title: string, seoTitle: string): string {
  const blob = `${slug} ${title} ${seoTitle}`.toLowerCase();
  if (/film|movie|cinema|odyssey/.test(blob)) return 'Filmanmeldelse';
  if (/serie|series|apple-tv|lucky/.test(blob)) return 'Serieanmeldelse';
  if (/koncert|concert|simz|miko|napalm|mille/.test(blob)) return 'Koncertanmeldelse';
  if (/festival|copenhell|roskilde/.test(blob) && /anmeldelse|review/.test(blob)) {
    return 'Festivalanmeldelse';
  }
  if (/spil|game|007|first-light/.test(blob)) return 'Spilanmeldelse';
  if (/album|ep\b/.test(blob)) return 'Albumanmeldelse';
  if (/kunst|graffiti|essay|hollaender/.test(blob)) return 'Feature';
  if (/anmeldelse|review/.test(blob)) return 'Koncertanmeldelse';
  return 'Feature';
}

/** Normalize URL or path for join keys (origin+path, no trailing slash). */
export function normalizePageKey(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const raw = url.trim();
    const u = raw.startsWith('http') ? new URL(raw) : new URL(raw, SITE_ORIGIN);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, '').toLowerCase();
  }
}

/** Path-only key for GA4 pagePath joins. */
export function normalizePathKey(path: string | null | undefined): string {
  if (!path) return '';
  try {
    const u = path.startsWith('http') ? new URL(path) : new URL(path, SITE_ORIGIN);
    return u.pathname.replace(/\/$/, '').toLowerCase() || '/';
  } catch {
    const p = path.trim().split('?')[0] || '';
    return (p.startsWith('/') ? p : `/${p}`).replace(/\/$/, '').toLowerCase() || '/';
  }
}

export function slugFromPath(path: string): string {
  const parts = normalizePathKey(path).split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

export function buildCanonicalGuess(slug: string, locale: ArchiveAuditLocale): string | null {
  if (!slug) return null;
  return locale === 'en' ? `${SITE_ORIGIN}/en/${slug}` : `${SITE_ORIGIN}/${slug}`;
}

export function computeAgeDays(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

export function ageBucketFromDays(days: number | null): ArchiveAgeBucket {
  if (days == null) return '1y+';
  if (days <= 30) return '0-30d';
  if (days <= 90) return '31-90d';
  if (days <= 365) return '91-365d';
  return '1y+';
}

export function freshnessFromDays(days: number | null): ArchiveFreshness {
  if (days == null) return 'unknown';
  if (days <= 90) return 'fresh';
  if (days <= 365) return 'aging';
  return 'stale';
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function countHtmlHeadings(html: string): number {
  const m = html.match(/<h[1-6]\b/gi);
  return m ? m.length : 0;
}

function countInternalLinks(html: string): number {
  const re = /href=["']([^"']+)["']/gi;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = (m[1] || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }
    if (
      href.startsWith('/') ||
      href.includes('aproposmagazine.com') ||
      (!/^https?:\/\//i.test(href) && !href.startsWith('//'))
    ) {
      n += 1;
    }
  }
  return n;
}

function imageAltPresent(fieldData: Record<string, unknown>): boolean {
  const thumb = fieldData.thumb;
  if (thumb && typeof thumb === 'object') {
    const alt = String((thumb as { alt?: string }).alt || '').trim();
    if (alt) return true;
  }
  const content = String(fieldData.content || '');
  if (/<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(content)) return true;
  // No images → not a finding
  if (!/<img\b/i.test(content) && !thumb) return true;
  return false;
}

export function classifyWinClass(
  findings: ArchiveAuditFinding[],
  priority: ArchiveAuditPriority
): ArchiveAuditWinClass {
  if (priority === 'ok') return 'ok';
  const codes = new Set(findings.map((f) => f.code));
  const quick = [
    'missing_seo_title',
    'missing_meta_description',
    'review_title_keyword_missing',
    'short_meta',
    'weak_seo_title',
    'missing_explicit_canonical',
    'missing_image_alt',
  ];
  if (quick.some((c) => codes.has(c as ArchiveAuditFindingCode))) return 'quick_win';
  if (
    codes.has('stale_content') ||
    codes.has('thin_content') ||
    codes.has('few_internal_links') ||
    codes.has('geo_answerability_gap')
  ) {
    return 'strategic';
  }
  return 'monitor';
}

export function auditLocaleFields(args: {
  seoTitle: string;
  metaDescription: string;
  language: ArchiveAuditLocale;
  articleTypeHint: string;
  published: boolean;
  seoTitleCounts: Map<string, number>;
  hasAuthor: boolean;
  introText: string;
  bodyText: string;
  headingCount: number;
  internalLinkCount: number;
  hasImageAlt: boolean;
  explicitCanonical: boolean;
  ageDays: number | null;
  freshness: ArchiveFreshness;
  siblingLocalePresent: boolean | null;
  lastPublished: string | null;
}): ArchiveAuditFinding[] {
  const findings: ArchiveAuditFinding[] = [];
  if (!args.published) {
    findings.push({
      code: 'unpublished',
      message: 'Locale er ikke publiceret',
      priority: 'P2',
    });
  }
  if (!args.seoTitle.trim()) {
    findings.push({
      code: 'missing_seo_title',
      message: 'Mangler seo-title',
      priority: 'P0',
    });
  } else if (args.seoTitle.trim().length < 25) {
    findings.push({
      code: 'weak_seo_title',
      message: 'Seo-title er kort (<25 tegn)',
      priority: 'P2',
      evidence: `${args.seoTitle.trim().length} tegn`,
    });
  }
  if (!args.metaDescription.trim()) {
    findings.push({
      code: 'missing_meta_description',
      message: 'Mangler meta-description',
      priority: 'P0',
    });
  } else if (args.metaDescription.trim().length < 70) {
    findings.push({
      code: 'short_meta',
      message: 'Meta-description er kort (<70 tegn)',
      priority: 'P2',
      evidence: `${args.metaDescription.trim().length} tegn`,
    });
  }

  if (args.seoTitle.trim()) {
    const review = checkReviewSeoTitle({
      seoTitle: args.seoTitle,
      language: args.language,
      articleType: args.articleTypeHint,
    });
    if (review.applies && !review.ok) {
      findings.push({
        code: 'review_title_keyword_missing',
        message: review.message || 'Mangler review-keyword i seo-title',
        priority: 'P0',
        evidence: args.articleTypeHint,
      });
    }
    const key = `${args.language}:${args.seoTitle.trim().toLowerCase()}`;
    if ((args.seoTitleCounts.get(key) || 0) > 1) {
      findings.push({
        code: 'duplicate_seo_title',
        message: 'Duplikeret seo-title i scannet batch',
        priority: 'P1',
        evidence: args.seoTitle,
      });
    }
  }

  if (!args.hasAuthor) {
    findings.push({
      code: 'missing_author',
      message: 'Mangler forfatter-reference',
      priority: 'P1',
      geoAeo: true,
      evidence: 'author-felt tomt',
    });
  }

  if (!args.introText.trim() || args.introText.trim().length < 40) {
    findings.push({
      code: 'thin_intro',
      message: 'Intro mangler eller er meget kort',
      priority: 'P2',
      evidence: `${args.introText.trim().length} tegn`,
    });
  }

  const words = args.bodyText.trim() ? args.bodyText.trim().split(/\s+/).length : 0;
  if (words > 0 && words < 250) {
    findings.push({
      code: 'thin_content',
      message: 'Tyndt brødtekst-indhold (<250 ord)',
      priority: 'P1',
      evidence: `${words} ord`,
    });
  }

  if (words >= 250 && args.headingCount < 2) {
    findings.push({
      code: 'weak_heading_structure',
      message: 'Få overskrifter i længere artikel',
      priority: 'P2',
      geoAeo: true,
      evidence: `${args.headingCount} headings`,
    });
  }

  if (!args.hasImageAlt) {
    findings.push({
      code: 'missing_image_alt',
      message: 'Billede mangler alt-tekst',
      priority: 'P2',
    });
  }

  if (words >= 400 && args.internalLinkCount < 1) {
    findings.push({
      code: 'few_internal_links',
      message: 'Ingen interne links i længere artikel',
      priority: 'P2',
      evidence: `${args.internalLinkCount} interne links`,
    });
  }

  if (args.freshness === 'stale') {
    findings.push({
      code: 'stale_content',
      message: 'Indhold er stale (>365 dage siden sidste publish)',
      priority: 'P2',
      geoAeo: true,
      evidence: args.ageDays != null ? `${args.ageDays} dage` : undefined,
    });
  }

  if (!args.explicitCanonical) {
    findings.push({
      code: 'missing_explicit_canonical',
      message: 'Ingen eksplicit canonical i CMS (bruger path-gæt til join)',
      priority: 'P2',
    });
  }

  if (!args.hasAuthor || !args.lastPublished) {
    findings.push({
      code: 'geo_author_date_gap',
      message: 'GEO/AEO: forfatter eller dato mangler klarhed',
      priority: 'P1',
      geoAeo: true,
      evidence: `author=${args.hasAuthor} date=${Boolean(args.lastPublished)}`,
    });
  }

  if (args.introText.trim().length > 0 && args.introText.trim().length < 80) {
    findings.push({
      code: 'geo_answerability_gap',
      message: 'GEO/AEO: intro er kort for answerability',
      priority: 'P2',
      geoAeo: true,
      evidence: `${args.introText.trim().length} tegn intro`,
    });
  }

  if (args.siblingLocalePresent === false) {
    findings.push({
      code: 'locale_pair_missing',
      message: 'Søster-locale mangler eller er upubliceret i denne scan',
      priority: 'P2',
      evidence: args.language === 'da' ? 'EN mangler' : 'DA mangler',
    });
  }

  return findings;
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Load GSC page (+ best query) index. Honest empty when GSC_SITE_URL missing.
 * Rows are sampled/top — not a complete archive.
 */
export async function loadGscPageIndex(days: number): Promise<{
  byPage: Map<string, GscPageMetric>;
  provenance: SearchSignalsProvenance | null;
}> {
  const period = { startDate: isoDateDaysAgo(days), endDate: isoDateToday() };
  const retrievedAt = new Date().toISOString();
  const siteUrl = getConfiguredGscSiteUrl();
  if (!siteUrl) {
    return {
      byPage: new Map(),
      provenance: {
        provider: 'gsc-search-analytics',
        period,
        retrievedAt,
        signalsAvailable: false,
        searchConsoleLinked: false,
        queryRowsAvailable: false,
        aggregateOnly: true,
        uiNote: 'ingen søgedata',
        setupStatus: 'GSC_SITE_URL mangler — page/query-join sprunget over',
        errorCode: 'gsc_site_url_missing',
      },
    };
  }

  let token: string;
  try {
    token = await getGscAccessToken();
  } catch (e) {
    return {
      byPage: new Map(),
      provenance: {
        provider: 'gsc-search-analytics',
        period,
        retrievedAt,
        signalsAvailable: false,
        searchConsoleLinked: false,
        queryRowsAvailable: false,
        aggregateOnly: true,
        uiNote: 'ingen søgedata',
        setupStatus: e instanceof Error ? e.message : 'GSC auth failed',
        errorCode: 'gsc_auth_failed',
      },
    };
  }

  const result = await defaultGscFetch({
    siteUrl,
    token,
    body: {
      startDate: period.startDate,
      endDate: period.endDate,
      dimensions: ['query', 'page'],
      rowLimit: 2500,
      startRow: 0,
    },
  });

  if (result.ok === false) {
    return {
      byPage: new Map(),
      provenance: {
        provider: 'gsc-search-analytics',
        period,
        retrievedAt,
        signalsAvailable: false,
        searchConsoleLinked: false,
        queryRowsAvailable: false,
        aggregateOnly: true,
        uiNote: 'ingen søgedata',
        setupStatus: result.message.slice(0, 200),
        errorCode: result.status === 403 || result.status === 401 ? 'gsc_permission_denied' : 'gsc_api_error',
      },
    };
  }

  const byPage = new Map<string, GscPageMetric>();
  for (const r of result.rows) {
    const query = (r.keys[0] || '').trim();
    const page = (r.keys[1] || '').trim();
    if (!page) continue;
    const key = normalizePageKey(page);
    if (!key) continue;
    const prev = byPage.get(key);
    if (!prev || r.clicks > prev.clicks) {
      byPage.set(key, {
        page,
        query: query || null,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        averagePosition: Number.isFinite(r.position) ? r.position : null,
      });
    }
  }

  return {
    byPage,
    provenance: {
      provider: 'gsc-search-analytics',
      period,
      retrievedAt,
      signalsAvailable: byPage.size > 0,
      searchConsoleLinked: true,
      queryRowsAvailable: byPage.size > 0,
      aggregateOnly: false,
      uiNote: byPage.size ? 'Search Console søgefraser aktive' : 'ingen søgedata',
      setupStatus: `archive_gsc_page_join rows=${result.rows.length} pages=${byPage.size} (sampled/top — not complete)`,
    },
  };
}

/**
 * Load GA4 pagePath metrics for join. Empty map + honest status when unavailable.
 */
export async function loadGa4PageIndex(days: number): Promise<{
  byPath: Map<string, Ga4PageMetric>;
  provenance: ArchiveAuditReport['ga4Provenance'];
}> {
  const property = getGa4PropertyResourceName();
  if (!property) {
    return {
      byPath: new Map(),
      provenance: {
        available: false,
        setupStatus: 'GA4_PROPERTY_ID mangler — pageviews-join sprunget over',
        rowCount: 0,
      },
    };
  }

  // Probe auth early for clearer provenance (defaultGa4Fetch also checks property).
  try {
    await getGa4AccessToken();
  } catch (e) {
    return {
      byPath: new Map(),
      provenance: {
        available: false,
        setupStatus: e instanceof Error ? e.message.slice(0, 160) : 'GA4 auth failed',
        rowCount: 0,
      },
    };
  }

  const startRel =
    days <= 7 ? '7daysAgo' : days <= 28 ? '28daysAgo' : days <= 30 ? '30daysAgo' : `${days}daysAgo`;

  const indexRows = (
    rows: Array<{ dimensions: string[]; metrics: string[] }>,
    withEngagement: boolean
  ) => {
    const byPath = new Map<string, Ga4PageMetric>();
    for (const row of rows) {
      const path = row.dimensions[0] || '';
      const key = normalizePathKey(path);
      if (!key || key === '/') continue;
      const pageViews = Number(row.metrics[0] || 0) || 0;
      const engagedSessions = withEngagement ? Number(row.metrics[1] || 0) || 0 : 0;
      const prev = byPath.get(key);
      if (!prev || pageViews > prev.pageViews) {
        byPath.set(key, { pagePath: path, pageViews, engagedSessions });
      }
      const slug = slugFromPath(path);
      if (slug) {
        const slugKey = `slug:${slug}`;
        const prevSlug = byPath.get(slugKey);
        if (!prevSlug || pageViews > prevSlug.pageViews) {
          byPath.set(slugKey, { pagePath: path, pageViews, engagedSessions });
        }
      }
    }
    return byPath;
  };

  const result = await defaultGa4Fetch({
    dateRanges: [{ startDate: startRel, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'engagedSessions' }],
    orderBys: [{ desc: true, metric: { metricName: 'screenPageViews' } }],
    limit: 5000,
  });

  if (result.ok === false) {
    // Retry without engagedSessions if metric unsupported
    const retry = await defaultGa4Fetch({
      dateRanges: [{ startDate: startRel, endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ desc: true, metric: { metricName: 'screenPageViews' } }],
      limit: 5000,
    });
    if (retry.ok === false) {
      return {
        byPath: new Map(),
        provenance: {
          available: false,
          setupStatus: retry.message.slice(0, 200),
          rowCount: 0,
        },
      };
    }
    const byPath = indexRows(retry.rows, false);
    return {
      byPath,
      provenance: {
        available: byPath.size > 0,
        setupStatus: `ga4_pagepath_ok rows=${retry.rows.length} (no engagedSessions)`,
        rowCount: retry.rows.length,
      },
    };
  }

  const byPath = indexRows(result.rows, true);
  return {
    byPath,
    provenance: {
      available: byPath.size > 0,
      setupStatus: `ga4_pagepath_ok rows=${result.rows.length}`,
      rowCount: result.rows.length,
    },
  };
}

function lookupGa4(
  byPath: Map<string, Ga4PageMetric> | undefined,
  canonicalUrl: string | null,
  slug: string
): Ga4PageMetric | undefined {
  if (!byPath) return undefined;
  const pathKey = normalizePathKey(canonicalUrl || '');
  if (pathKey && byPath.has(pathKey)) return byPath.get(pathKey);
  // Try /articles/ + slug common variant
  if (slug) {
    const articles = normalizePathKey(`/articles/${slug}`);
    if (byPath.has(articles)) return byPath.get(articles);
    const slugKey = `slug:${slug.toLowerCase()}`;
    if (byPath.has(slugKey)) return byPath.get(slugKey);
  }
  return undefined;
}

function lookupGsc(
  byPage: Map<string, GscPageMetric> | undefined,
  canonicalUrl: string | null,
  slug: string,
  locale: ArchiveAuditLocale
): GscPageMetric | undefined {
  if (!byPage || !byPage.size) return undefined;
  const keys = [
    normalizePageKey(canonicalUrl),
    normalizePageKey(buildCanonicalGuess(slug, locale)),
    normalizePageKey(`${SITE_ORIGIN}/articles/${slug}`),
    locale === 'en'
      ? normalizePageKey(`${SITE_ORIGIN}/en/articles/${slug}`)
      : '',
  ].filter(Boolean);
  for (const k of keys) {
    const hit = byPage.get(k);
    if (hit) return hit;
  }
  // Fallback: match by path ending with /slug
  const needle = `/${slug.toLowerCase()}`;
  for (const [k, v] of byPage) {
    if (k.endsWith(needle)) return v;
  }
  return undefined;
}

export function buildSegmentSummaries(rows: ArchiveAuditRow[]): ArchiveAuditSegmentSummary[] {
  const map = new Map<string, ArchiveAuditRow[]>();
  for (const r of rows) {
    const key = `${r.articleTypeHint}|${r.locale}|${r.ageBucket}|${r.freshness}`;
    const list = map.get(key) || [];
    list.push(r);
    map.set(key, list);
  }
  const out: ArchiveAuditSegmentSummary[] = [];
  for (const [key, list] of map) {
    const [articleType, locale, ageBucket, freshness] = key.split('|');
    out.push({
      key,
      articleType: articleType || 'Feature',
      locale: (locale as ArchiveAuditLocale) || 'da',
      ageBucket: (ageBucket as ArchiveAgeBucket) || '1y+',
      freshness: (freshness as ArchiveFreshness) || 'unknown',
      count: list.length,
      p0: list.filter((r) => r.priority === 'P0').length,
      p1: list.filter((r) => r.priority === 'P1').length,
      medianGa4Views: median(
        list.map((r) => r.ga4PageViews).filter((n): n is number => n != null)
      ),
      medianGscClicks: median(
        list.map((r) => r.gscClicks).filter((n): n is number => n != null)
      ),
    });
  }
  out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return out.slice(0, 40);
}

/**
 * Observed associations only — never framed as causation or "AI ranking secrets".
 */
export function buildPatternNotes(rows: ArchiveAuditRow[]): ArchiveAuditPatternNote[] {
  const notes: ArchiveAuditPatternNote[] = [];
  const withGsc = rows.filter((r) => r.gscPageMatched && (r.gscClicks ?? 0) >= 0);
  const reviewOk = withGsc.filter(
    (r) =>
      isReviewSeoArticleType(r.articleTypeHint) &&
      !r.findings.some((f) => f.code === 'review_title_keyword_missing')
  );
  const reviewMissing = withGsc.filter((r) =>
    r.findings.some((f) => f.code === 'review_title_keyword_missing')
  );
  if (reviewOk.length >= 3 && reviewMissing.length >= 1) {
    const medOk = median(reviewOk.map((r) => r.gscClicks || 0));
    const medMiss = median(reviewMissing.map((r) => r.gscClicks || 0));
    notes.push({
      id: 'review_keyword_vs_gsc_clicks',
      observation: `Inden for review-typer med GSC-join: median klik ${medOk ?? 'n/a'} (keyword OK, n=${reviewOk.length}) vs ${medMiss ?? 'n/a'} (mangler keyword, n=${reviewMissing.length}).`,
      caveat:
        'Observeret association i denne stikprøve — ikke årsag. Segmentér altid efter type/alder før sammenligning.',
      sampleSize: reviewOk.length + reviewMissing.length,
    });
  }

  const fresh = rows.filter((r) => r.freshness === 'fresh' && r.ga4PageMatched);
  const stale = rows.filter((r) => r.freshness === 'stale' && r.ga4PageMatched);
  if (fresh.length >= 3 && stale.length >= 3) {
    notes.push({
      id: 'freshness_vs_ga4_views',
      observation: `Median GA4 pageviews: fresh ${median(fresh.map((r) => r.ga4PageViews || 0)) ?? 'n/a'} (n=${fresh.length}) vs stale ${median(stale.map((r) => r.ga4PageViews || 0)) ?? 'n/a'} (n=${stale.length}).`,
      caveat:
        'Observeret association — ikke årsag. Nye koncertanmeldelser bør ikke råt sammenlignes med evergreen essays; brug type+age-segmenter.',
      sampleSize: fresh.length + stale.length,
    });
  }

  const entityish = rows.filter(
    (r) => r.seoTitle.trim().length >= 25 && r.gscPageMatched && (r.gscClicks || 0) > 0
  );
  if (entityish.length >= 5) {
    notes.push({
      id: 'entity_length_titles_with_clicks',
      observation: `${entityish.length} rækker med seo-title ≥25 tegn har GSC-klik i vinduet (top query kan pege på entity-match).`,
      caveat:
        'Ingen hemmelige AI-rankingfaktorer. Prioritér klar entitet, forfatter/dato, schema-consistency og crawlability.',
      sampleSize: entityish.length,
    });
  }

  if (!notes.length) {
    notes.push({
      id: 'insufficient_join_sample',
      observation:
        'For få join-hits til stabile mønstre i denne kørsel. Kør igen med GA4_PROPERTY_ID + GSC_SITE_URL og større limit.',
      caveat: 'Manglende data er ikke fravær af performance — kun manglende join.',
      sampleSize: rows.length,
    });
  }

  return notes;
}

/**
 * Read-only archive audit over published DK items (+ EN when present).
 * Bounded by `limit` articles (not locales). No CMS writes.
 */
export async function runArchiveAudit(
  options?: {
    limit?: number;
    locales?: ArchiveAuditLocale[];
    measurementWindowDays?: number;
  },
  deps: ArchiveAuditDeps = {}
): Promise<ArchiveAuditReport> {
  const limit = Math.max(1, Math.min(1000, options?.limit ?? 50));
  const locales = options?.locales?.length
    ? options.locales
    : (['da', 'en'] as ArchiveAuditLocale[]);
  const days = Math.max(7, Math.min(90, options?.measurementWindowDays ?? 28));
  const listFn = deps.listFn || listDkArticleItems;
  const fetchFn = deps.fetchFn || fetchArticleItemByLocale;
  const nowMs = (deps.now || Date.now)();
  const nowIso = new Date(nowMs).toISOString();
  const { dk, en } = resolveWebflowLocaleIds();

  const listed = (await listFn())
    .filter((it) => it.lastPublished && !it.isDraft)
    .sort((a, b) => String(b.lastPublished).localeCompare(String(a.lastPublished)))
    .slice(0, limit);

  let gscByPage = deps.gscByPage;
  let gscProvenance: SearchSignalsProvenance | null = null;
  if (!gscByPage && !deps.skipGsc) {
    const loaded = await (deps.loadGscFn || loadGscPageIndex)(days);
    gscByPage = loaded.byPage;
    gscProvenance = loaded.provenance;
  }

  let ga4ByPath = deps.ga4ByPath;
  let ga4Provenance: ArchiveAuditReport['ga4Provenance'] = null;
  if (!ga4ByPath && !deps.skipGa4) {
    const loaded = await (deps.loadGa4Fn || loadGa4PageIndex)(days);
    ga4ByPath = loaded.byPath;
    ga4Provenance = loaded.provenance;
  }

  const pending: Array<{
    item: ListedArticleItem;
    locale: ArchiveAuditLocale;
    cmsLocaleId: string;
  }> = [];
  for (const item of listed) {
    if (locales.includes('da')) pending.push({ item, locale: 'da', cmsLocaleId: dk });
    if (locales.includes('en')) pending.push({ item, locale: 'en', cmsLocaleId: en });
  }

  type Draft = {
    itemId: string;
    locale: ArchiveAuditLocale;
    cmsLocaleId: string;
    slug: string;
    title: string;
    seoTitle: string;
    metaDescription: string;
    published: boolean;
    lastPublished: string | null;
    lastUpdated: string | null;
    articleTypeHint: string;
    canonicalUrl: string | null;
    explicitCanonical: boolean;
    ageBucket: ArchiveAgeBucket;
    freshness: ArchiveFreshness;
    ageDays: number | null;
    gscPageMatched: boolean;
    gscTopQuery: string | null;
    gscClicks: number | null;
    gscImpressions: number | null;
    gscCtr: number | null;
    gscAvgPosition: number | null;
    ga4PageMatched: boolean;
    ga4PageViews: number | null;
    ga4EngagedSessions: number | null;
    wordCount: number | null;
    headingCount: number | null;
    internalLinkCount: number | null;
    hasAuthor: boolean;
    hasIntro: boolean;
    hasImageAlt: boolean;
    introText: string;
    bodyText: string;
    siblingLocalePresent: boolean | null;
    fetchError?: string;
  };

  const draftRows: Draft[] = [];
  const seoTitleCounts = new Map<string, number>();
  const publishedByItem = new Map<string, Set<ArchiveAuditLocale>>();
  let fetchErrors = 0;

  // Sequential fetches — Webflow rate limits; archive is read-only batch.
  for (const p of pending) {
    try {
      const live = await fetchFn(p.item.id, p.cmsLocaleId);
      const published = isWebflowLocalePublished(live);
      const slugs = getCmsSeoSlugs();
      const seoTitle = isCmsSeoFieldEmpty(live.fieldData[slugs.seoTitle])
        ? ''
        : String(live.fieldData[slugs.seoTitle]).trim();
      const metaDescription = isCmsSeoFieldEmpty(live.fieldData[slugs.metaDescription])
        ? ''
        : String(live.fieldData[slugs.metaDescription]).trim();
      const slug = String(live.fieldData.slug || p.item.slug || '').trim();
      const title = String(live.fieldData.name || live.fieldData.title || p.item.title || '').trim();
      const articleTypeHint = inferArticleTypeHint(slug, title, seoTitle);
      const explicitCanonical = Boolean(
        String(live.fieldData['canonical-url'] || live.fieldData.canonical || '').trim()
      );
      const canonicalUrl =
        String(live.fieldData['canonical-url'] || live.fieldData.canonical || '').trim() ||
        buildCanonicalGuess(slug, p.locale);

      const html = String(live.fieldData.content || '');
      const introRaw = String(live.fieldData.intro || '');
      const introText = stripHtmlToText(introRaw);
      const bodyText = stripHtmlToText(html);
      const headingCount = countHtmlHeadings(html);
      const internalLinkCount = countInternalLinks(html);
      const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
      const hasAuthor = Boolean(live.fieldData.author);
      const hasIntro = introText.trim().length > 0;
      const hasImageAlt = imageAltPresent(live.fieldData as Record<string, unknown>);

      const ageDays = computeAgeDays(live.lastPublished ? String(live.lastPublished) : null, nowMs);
      const ageBucket = ageBucketFromDays(ageDays);
      const freshness = freshnessFromDays(ageDays);

      if (seoTitle) {
        const key = `${p.locale}:${seoTitle.toLowerCase()}`;
        seoTitleCounts.set(key, (seoTitleCounts.get(key) || 0) + 1);
      }

      const gsc = lookupGsc(gscByPage, canonicalUrl, slug, p.locale);
      const ga4 = lookupGa4(ga4ByPath, canonicalUrl, slug);

      if (published) {
        const set = publishedByItem.get(p.item.id) || new Set();
        set.add(p.locale);
        publishedByItem.set(p.item.id, set);
      }

      draftRows.push({
        itemId: p.item.id,
        locale: p.locale,
        cmsLocaleId: p.cmsLocaleId,
        slug,
        title,
        seoTitle,
        metaDescription,
        published,
        lastPublished: live.lastPublished ? String(live.lastPublished) : null,
        lastUpdated: live.lastUpdated ? String(live.lastUpdated) : null,
        articleTypeHint,
        canonicalUrl,
        explicitCanonical,
        ageBucket,
        freshness,
        ageDays,
        gscPageMatched: Boolean(gsc),
        gscTopQuery: gsc?.query ?? null,
        gscClicks: gsc?.clicks ?? null,
        gscImpressions: gsc?.impressions ?? null,
        gscCtr: gsc?.ctr ?? null,
        gscAvgPosition: gsc?.averagePosition ?? null,
        ga4PageMatched: Boolean(ga4),
        ga4PageViews: ga4?.pageViews ?? null,
        ga4EngagedSessions: ga4?.engagedSessions ?? null,
        wordCount,
        headingCount,
        internalLinkCount,
        hasAuthor,
        hasIntro,
        hasImageAlt,
        introText,
        bodyText,
        siblingLocalePresent: null,
      });
    } catch (e) {
      fetchErrors += 1;
      draftRows.push({
        itemId: p.item.id,
        locale: p.locale,
        cmsLocaleId: p.cmsLocaleId,
        slug: p.item.slug,
        title: p.item.title,
        seoTitle: '',
        metaDescription: '',
        published: false,
        lastPublished: p.item.lastPublished || null,
        lastUpdated: p.item.lastUpdated,
        articleTypeHint: 'Feature',
        canonicalUrl: null,
        explicitCanonical: false,
        ageBucket: ageBucketFromDays(computeAgeDays(p.item.lastPublished, nowMs)),
        freshness: freshnessFromDays(computeAgeDays(p.item.lastPublished, nowMs)),
        ageDays: computeAgeDays(p.item.lastPublished, nowMs),
        gscPageMatched: false,
        gscTopQuery: null,
        gscClicks: null,
        gscImpressions: null,
        gscCtr: null,
        gscAvgPosition: null,
        ga4PageMatched: false,
        ga4PageViews: null,
        ga4EngagedSessions: null,
        wordCount: null,
        headingCount: null,
        internalLinkCount: null,
        hasAuthor: false,
        hasIntro: false,
        hasImageAlt: true,
        introText: '',
        bodyText: '',
        siblingLocalePresent: null,
        fetchError: e instanceof Error ? e.message.slice(0, 120) : 'fetch fejl',
      });
    }
  }

  // Sibling locale presence (when both locales requested)
  if (locales.includes('da') && locales.includes('en')) {
    for (const d of draftRows) {
      const set = publishedByItem.get(d.itemId);
      if (!set) {
        d.siblingLocalePresent = false;
        continue;
      }
      const other: ArchiveAuditLocale = d.locale === 'da' ? 'en' : 'da';
      d.siblingLocalePresent = set.has(other);
    }
  }

  const rows: ArchiveAuditRow[] = draftRows.map((d) => {
    const findings = d.fetchError
      ? [
          {
            code: 'fetch_error' as const,
            message: d.fetchError,
            priority: 'P1' as const,
          },
        ]
      : auditLocaleFields({
          seoTitle: d.seoTitle,
          metaDescription: d.metaDescription,
          language: d.locale,
          articleTypeHint: d.articleTypeHint,
          published: d.published,
          seoTitleCounts,
          hasAuthor: d.hasAuthor,
          introText: d.introText,
          bodyText: d.bodyText,
          headingCount: d.headingCount ?? 0,
          internalLinkCount: d.internalLinkCount ?? 0,
          hasImageAlt: d.hasImageAlt,
          explicitCanonical: d.explicitCanonical,
          ageDays: d.ageDays,
          freshness: d.freshness,
          siblingLocalePresent: d.siblingLocalePresent,
          lastPublished: d.lastPublished,
        });
    const priority = worstPriority(findings);
    const {
      fetchError: _fe,
      introText: _i,
      bodyText: _b,
      hasImageAlt: _a,
      ...rest
    } = d;
    void _fe;
    void _i;
    void _b;
    void _a;
    return {
      ...rest,
      findings,
      priority,
      winClass: classifyWinClass(findings, priority),
    };
  });

  rows.sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    const clicks = (b.gscClicks || 0) - (a.gscClicks || 0);
    if (clicks !== 0) return clicks;
    return (b.ga4PageViews || 0) - (a.ga4PageViews || 0);
  });

  const summary = {
    p0: rows.filter((r) => r.priority === 'P0').length,
    p1: rows.filter((r) => r.priority === 'P1').length,
    p2: rows.filter((r) => r.priority === 'P2').length,
    ok: rows.filter((r) => r.priority === 'ok').length,
    fetchErrors,
    gscJoinHits: rows.filter((r) => r.gscPageMatched).length,
    ga4JoinHits: rows.filter((r) => r.ga4PageMatched).length,
    quickWins: rows.filter((r) => r.winClass === 'quick_win').length,
    strategic: rows.filter((r) => r.winClass === 'strategic').length,
  };

  return {
    schemaVersion: 2,
    kind: 'archive-audit',
    mode: 'read-only',
    createdAt: nowIso,
    measurementWindowDays: days,
    locales,
    limit,
    scanned: rows.length,
    summary,
    segments: buildSegmentSummaries(rows),
    patterns: buildPatternNotes(rows),
    gscProvenance,
    ga4Provenance,
    note:
      'Read-only SEO+GEO/AEO archive audit. GSC page/query rows are sampled/top — not a complete archive. GA4 joins by pagePath/slug (path variants). Broken outbound links are not HTTP-probed in this pass. JSON-LD is generated_not_published in CMS — not treated as a CMS missing-field error. No CMS writes. Batch selection is for human review only; archive-wide overwrite is not authorized. Correlations are associations, not causes.',
    rows,
  };
}

export function isReviewTypeHint(type: string): boolean {
  return isReviewSeoArticleType(type);
}

/** Keys selected in UI for a future explicit apply preview (never auto-applied). */
export function selectedBatchKeys(rows: ArchiveAuditRow[], keys: string[]): ArchiveAuditRow[] {
  const set = new Set(keys);
  return rows.filter((r) => set.has(`${r.itemId}:${r.locale}`));
}
