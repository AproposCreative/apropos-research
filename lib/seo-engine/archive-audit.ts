/**
 * Read-only SEO + GEO/AEO archive audit.
 *
 * Scans published Webflow locales, flags missing/weak SEO fields, review-keyword
 * gaps, and optional GSC page join (sampled/top rows — not a complete corpus).
 * Never writes CMS. Apply/overwrite is out of scope for this module.
 */

import { getCmsSeoSlugs, isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
import { checkReviewSeoTitle, isReviewSeoArticleType } from '@/lib/seo-engine/review-title-rule';
import {
  getSearchSignalsProvider,
  type SearchSignalsProvenance,
} from '@/lib/seo-engine/search-signals';
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
  | 'unpublished'
  | 'fetch_error';

export type ArchiveAuditPriority = 'P0' | 'P1' | 'P2' | 'ok';

export type ArchiveAuditFinding = {
  code: ArchiveAuditFindingCode;
  message: string;
  priority: ArchiveAuditPriority;
  evidence?: string;
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
  findings: ArchiveAuditFinding[];
  priority: ArchiveAuditPriority;
  gscPageMatched: boolean;
  gscTopQuery: string | null;
  gscClicks: number | null;
  gscImpressions: number | null;
};

export type ArchiveAuditReport = {
  schemaVersion: 1;
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
  };
  gscProvenance: SearchSignalsProvenance | null;
  note: string;
  rows: ArchiveAuditRow[];
};

export type ArchiveAuditDeps = {
  listFn?: () => Promise<ListedArticleItem[]>;
  fetchFn?: typeof fetchArticleItemByLocale;
  now?: () => number;
  /** Optional GSC page→metrics map for join (tests / preloaded). */
  gscByPage?: Map<
    string,
    { query: string; clicks: number; impressions: number; page: string }
  >;
  skipGsc?: boolean;
};

const PRIORITY_RANK: Record<ArchiveAuditPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  ok: 3,
};

function worstPriority(findings: ArchiveAuditFinding[]): ArchiveAuditPriority {
  if (findings.length === 0) return 'ok';
  return findings.reduce(
    (worst, f) => (PRIORITY_RANK[f.priority] < PRIORITY_RANK[worst] ? f.priority : worst),
    'ok' as ArchiveAuditPriority
  );
}

function inferArticleTypeHint(slug: string, title: string, seoTitle: string): string {
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

function normalizePageKey(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, '').toLowerCase();
  }
}

function buildCanonicalGuess(slug: string, locale: ArchiveAuditLocale): string | null {
  if (!slug) return null;
  const base = 'https://www.aproposmagazine.com';
  return locale === 'en' ? `${base}/en/${slug}` : `${base}/${slug}`;
}

export function auditLocaleFields(args: {
  seoTitle: string;
  metaDescription: string;
  language: ArchiveAuditLocale;
  articleTypeHint: string;
  published: boolean;
  seoTitleCounts: Map<string, number>;
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

  return findings;
}

async function loadGscPageIndex(
  days: number
): Promise<{
  byPage: Map<string, { query: string; clicks: number; impressions: number; page: string }>;
  provenance: SearchSignalsProvenance | null;
}> {
  try {
    const provider = getSearchSignalsProvider();
    const bundle = await provider.getSignals({
      seeds: ['apropos'],
      language: 'da',
      days,
      limit: 25,
      articleType: 'Feature',
    });
    const byPage = new Map<
      string,
      { query: string; clicks: number; impressions: number; page: string }
    >();
    for (const s of bundle.signals) {
      if (!s.page) continue;
      const key = normalizePageKey(s.page);
      if (!key) continue;
      const prev = byPage.get(key);
      const clicks = s.clicks ?? 0;
      if (!prev || clicks > prev.clicks) {
        byPage.set(key, {
          query: s.query,
          clicks,
          impressions: s.impressions ?? 0,
          page: s.page,
        });
      }
    }
    return { byPage, provenance: bundle.provenance };
  } catch {
    return { byPage: new Map(), provenance: null };
  }
}

/**
 * Read-only archive audit over newest published DK items (+ EN when present).
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
  const limit = Math.max(1, Math.min(200, options?.limit ?? 50));
  const locales = options?.locales?.length
    ? options.locales
    : (['da', 'en'] as ArchiveAuditLocale[]);
  const days = Math.max(7, Math.min(90, options?.measurementWindowDays ?? 28));
  const listFn = deps.listFn || listDkArticleItems;
  const fetchFn = deps.fetchFn || fetchArticleItemByLocale;
  const nowIso = new Date((deps.now || Date.now)()).toISOString();
  const { dk, en } = resolveWebflowLocaleIds();

  const listed = (await listFn())
    .filter((it) => it.lastPublished && !it.isDraft)
    .sort((a, b) => String(b.lastPublished).localeCompare(String(a.lastPublished)))
    .slice(0, limit);

  let gscByPage = deps.gscByPage;
  let gscProvenance: SearchSignalsProvenance | null = null;
  if (!gscByPage && !deps.skipGsc) {
    const loaded = await loadGscPageIndex(days);
    gscByPage = loaded.byPage;
    gscProvenance = loaded.provenance;
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

  const draftRows: Array<{
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
    gscPageMatched: boolean;
    gscTopQuery: string | null;
    gscClicks: number | null;
    gscImpressions: number | null;
    fetchError?: string;
  }> = [];
  const seoTitleCounts = new Map<string, number>();
  let fetchErrors = 0;

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
      const canonicalUrl =
        String(live.fieldData['canonical-url'] || live.fieldData.canonical || '').trim() ||
        buildCanonicalGuess(slug, p.locale);

      if (seoTitle) {
        const key = `${p.locale}:${seoTitle.toLowerCase()}`;
        seoTitleCounts.set(key, (seoTitleCounts.get(key) || 0) + 1);
      }

      const pageKey = normalizePageKey(canonicalUrl);
      const gsc = pageKey && gscByPage ? gscByPage.get(pageKey) : undefined;

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
        gscPageMatched: Boolean(gsc),
        gscTopQuery: gsc?.query ?? null,
        gscClicks: gsc?.clicks ?? null,
        gscImpressions: gsc?.impressions ?? null,
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
        gscPageMatched: false,
        gscTopQuery: null,
        gscClicks: null,
        gscImpressions: null,
        fetchError: e instanceof Error ? e.message.slice(0, 120) : 'fetch fejl',
      });
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
        });
    const { fetchError: _fe, ...rest } = d;
    void _fe;
    return {
      ...rest,
      findings,
      priority: worstPriority(findings),
    };
  });

  rows.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  const summary = {
    p0: rows.filter((r) => r.priority === 'P0').length,
    p1: rows.filter((r) => r.priority === 'P1').length,
    p2: rows.filter((r) => r.priority === 'P2').length,
    ok: rows.filter((r) => r.priority === 'ok').length,
    fetchErrors,
    gscJoinHits: rows.filter((r) => r.gscPageMatched).length,
  };

  return {
    schemaVersion: 1,
    kind: 'archive-audit',
    mode: 'read-only',
    createdAt: nowIso,
    measurementWindowDays: days,
    locales,
    limit,
    scanned: rows.length,
    summary,
    gscProvenance,
    note:
      'Read-only audit. GSC page/query rows are sampled/top — not a complete archive. No CMS writes. Review-type hints are heuristic until analysis is stored.',
    rows,
  };
}

export function isReviewTypeHint(type: string): boolean {
  return isReviewSeoArticleType(type);
}
