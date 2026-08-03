/**
 * Pure scoring / signal detection for the opportunity engine.
 * No network I/O — injectable row data for tests.
 */

import type { OpportunityEvidence, OpportunitySignalKind } from '@/lib/seo-engine/opportunity-engine/types';
import { isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';

export type QueryPageRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type PageAggregate = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQuery: string | null;
};

export type ScoringThresholds = {
  highImpressions: number;
  lowCtr: number;
  positionMin: number;
  positionMax: number;
  risingImpressionsMin: number;
  risingGrowthRatio: number;
  decliningDropRatio: number;
  decliningPrevImpressionsMin: number;
  cannibalMinPages: number;
  cannibalMinImpressions: number;
};

export const DEFAULT_THRESHOLDS: ScoringThresholds = {
  highImpressions: 200,
  lowCtr: 0.02,
  positionMin: 4,
  positionMax: 20,
  risingImpressionsMin: 80,
  risingGrowthRatio: 1.35,
  decliningDropRatio: 0.65,
  decliningPrevImpressionsMin: 100,
  cannibalMinPages: 2,
  cannibalMinImpressions: 50,
};

export function aggregateByPage(rows: QueryPageRow[]): Map<string, PageAggregate> {
  const map = new Map<string, PageAggregate>();
  for (const r of rows) {
    const key = r.page;
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        page: key,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        topQuery: r.query || null,
      });
      continue;
    }
    const impressions = prev.impressions + r.impressions;
    const clicks = prev.clicks + r.clicks;
    prev.clicks = clicks;
    prev.impressions = impressions;
    prev.ctr = impressions > 0 ? clicks / impressions : 0;
    // impression-weighted position
    prev.position =
      impressions > 0
        ? (prev.position * (impressions - r.impressions) + r.position * r.impressions) /
          impressions
        : prev.position;
    if (r.clicks > (prev.topQuery ? 0 : -1) && r.query) {
      // keep highest-click query as top
    }
    if (!prev.topQuery || r.clicks >= (rows.find((x) => x.query === prev.topQuery && x.page === key)?.clicks || 0)) {
      if (r.query) prev.topQuery = r.query;
    }
  }
  return map;
}

export function detectHighImpressionsLowCtr(
  row: QueryPageRow | PageAggregate,
  t: ScoringThresholds = DEFAULT_THRESHOLDS
): boolean {
  return row.impressions >= t.highImpressions && row.ctr < t.lowCtr;
}

export function detectPositionBand(
  row: QueryPageRow | PageAggregate,
  t: ScoringThresholds = DEFAULT_THRESHOLDS
): boolean {
  const pos = row.position;
  return Number.isFinite(pos) && pos >= t.positionMin && pos <= t.positionMax;
}

export function detectRisingQuery(args: {
  current: QueryPageRow;
  previous: QueryPageRow | null;
  thresholds?: ScoringThresholds;
}): boolean {
  const t = args.thresholds || DEFAULT_THRESHOLDS;
  if (!args.previous) return false;
  if (args.current.impressions < t.risingImpressionsMin) return false;
  if (args.previous.impressions <= 0) return args.current.impressions >= t.risingImpressionsMin;
  return args.current.impressions / args.previous.impressions >= t.risingGrowthRatio;
}

export function detectDecliningArticle(args: {
  current: PageAggregate;
  previous: PageAggregate | null;
  thresholds?: ScoringThresholds;
}): boolean {
  const t = args.thresholds || DEFAULT_THRESHOLDS;
  if (!args.previous) return false;
  if (args.previous.impressions < t.decliningPrevImpressionsMin) return false;
  return args.current.impressions <= args.previous.impressions * t.decliningDropRatio;
}

export function detectCannibalization(args: {
  query: string;
  pages: Array<{ page: string; impressions: number; clicks: number; position: number }>;
  thresholds?: ScoringThresholds;
}): { hit: boolean; pages: string[] } {
  const t = args.thresholds || DEFAULT_THRESHOLDS;
  const significant = args.pages.filter((p) => p.impressions >= t.cannibalMinImpressions);
  if (significant.length < t.cannibalMinPages) return { hit: false, pages: [] };
  return {
    hit: true,
    pages: significant
      .sort((a, b) => b.impressions - a.impressions)
      .map((p) => p.page)
      .slice(0, 8),
  };
}

export function detectWeakOrMissingMeta(args: {
  seoTitle?: string | null;
  metaDescription?: string | null;
}): boolean {
  const titleEmpty = isCmsSeoFieldEmpty(args.seoTitle);
  const metaEmpty = isCmsSeoFieldEmpty(args.metaDescription);
  if (titleEmpty || metaEmpty) return true;
  const title = String(args.seoTitle || '').trim();
  const meta = String(args.metaDescription || '').trim();
  if (title.length < 20 || title.length > 70) return true;
  if (meta.length < 70 || meta.length > 170) return true;
  return false;
}

export type ScoredOpportunityDraft = {
  page: string;
  query: string | null;
  signals: OpportunitySignalKind[];
  score: number;
  why: string;
  evidence: OpportunityEvidence;
};

/**
 * Score one page from current/previous windows + optional CMS meta + GA4.
 */
export function scorePageOpportunity(args: {
  page: string;
  currentRows: QueryPageRow[];
  previousRows: QueryPageRow[];
  /** All current rows for same query (cannibalization). */
  queryToPages: Map<string, QueryPageRow[]>;
  seoTitle?: string | null;
  metaDescription?: string | null;
  ga4PageViews?: number | null;
  ga4EngagedSessions?: number | null;
  thresholds?: ScoringThresholds;
}): ScoredOpportunityDraft | null {
  const t = args.thresholds || DEFAULT_THRESHOLDS;
  const pageRows = args.currentRows.filter((r) => r.page === args.page);
  if (pageRows.length === 0 && !detectWeakOrMissingMeta(args)) return null;

  const currentAgg = aggregateByPage(pageRows).get(args.page) || {
    page: args.page,
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
    topQuery: null,
  };
  const prevPageRows = args.previousRows.filter((r) => r.page === args.page);
  const prevAgg = aggregateByPage(prevPageRows).get(args.page) || null;

  const signals: OpportunitySignalKind[] = [];
  const whyParts: string[] = [];

  const topRow =
    [...pageRows].sort((a, b) => b.impressions - a.impressions)[0] || null;

  if (detectHighImpressionsLowCtr(currentAgg, t)) {
    signals.push('high_impressions_low_ctr');
    whyParts.push(
      `Høje impressions (${Math.round(currentAgg.impressions)}) med lav CTR (${(currentAgg.ctr * 100).toFixed(1)}%)`
    );
  }
  if (detectPositionBand(currentAgg, t)) {
    signals.push('position_4_to_20');
    whyParts.push(`Gennemsnitlig position ${currentAgg.position.toFixed(1)} (side 1–2, ikke top-3)`);
  }
  if (topRow && detectRisingQuery({ current: topRow, previous: findPrevQuery(args.previousRows, topRow), thresholds: t })) {
    signals.push('rising_query');
    whyParts.push(`Stigende query "${topRow.query}" (seneste 28d vs forrige 28d)`);
  }
  if (detectDecliningArticle({ current: currentAgg, previous: prevAgg, thresholds: t })) {
    signals.push('declining_article');
    whyParts.push(
      `Faldende impressions (${Math.round(prevAgg!.impressions)} → ${Math.round(currentAgg.impressions)})`
    );
  }

  let competingPages: string[] = [];
  if (topRow?.query) {
    const siblings = args.queryToPages.get(topRow.query.toLowerCase()) || [];
    const cannibal = detectCannibalization({
      query: topRow.query,
      pages: siblings.map((s) => ({
        page: s.page,
        impressions: s.impressions,
        clicks: s.clicks,
        position: s.position,
      })),
      thresholds: t,
    });
    if (cannibal.hit) {
      signals.push('query_cannibalization');
      competingPages = cannibal.pages.filter((p) => p !== args.page);
      whyParts.push(
        `Query-cannibalization: "${topRow.query}" ranker på ${cannibal.pages.length} sider`
      );
    }
  }

  if (detectWeakOrMissingMeta(args)) {
    signals.push('weak_or_missing_meta');
    whyParts.push('Manglende eller svag SEO-title/meta-description');
  }

  if (signals.length === 0) return null;

  let score = 0;
  for (const s of signals) {
    score += SIGNAL_WEIGHTS[s];
  }
  // Boost by impression volume (log scale)
  score += Math.min(25, Math.log10(Math.max(1, currentAgg.impressions)) * 8);
  if ((args.ga4EngagedSessions || 0) > 0) {
    score += Math.min(10, Math.log10(Math.max(1, args.ga4EngagedSessions || 1)) * 4);
  }

  const prevTop = topRow ? findPrevQuery(args.previousRows, topRow) : null;

  return {
    page: args.page,
    query: topRow?.query || currentAgg.topQuery,
    signals,
    score: Math.round(score * 10) / 10,
    why: whyParts.join('. ') + '.',
    evidence: {
      query: topRow?.query || currentAgg.topQuery,
      page: args.page,
      clicks: currentAgg.clicks,
      impressions: currentAgg.impressions,
      ctr: currentAgg.ctr,
      position: currentAgg.position || null,
      prevClicks: prevAgg?.clicks ?? prevTop?.clicks ?? null,
      prevImpressions: prevAgg?.impressions ?? prevTop?.impressions ?? null,
      prevCtr: prevAgg?.ctr ?? prevTop?.ctr ?? null,
      prevPosition: prevAgg?.position ?? prevTop?.position ?? null,
      ga4PageViews: args.ga4PageViews ?? null,
      ga4EngagedSessions: args.ga4EngagedSessions ?? null,
      competingPages,
      currentSeoTitle: args.seoTitle ?? null,
      currentMetaDescription: args.metaDescription ?? null,
    },
  };
}

const SIGNAL_WEIGHTS: Record<OpportunitySignalKind, number> = {
  high_impressions_low_ctr: 28,
  position_4_to_20: 18,
  rising_query: 16,
  declining_article: 20,
  query_cannibalization: 22,
  weak_or_missing_meta: 14,
};

function findPrevQuery(prev: QueryPageRow[], current: QueryPageRow): QueryPageRow | null {
  const q = current.query.toLowerCase();
  const page = current.page;
  return (
    prev.find((r) => r.page === page && r.query.toLowerCase() === q) ||
    prev.find((r) => r.query.toLowerCase() === q) ||
    null
  );
}

export function buildQueryToPagesIndex(rows: QueryPageRow[]): Map<string, QueryPageRow[]> {
  const map = new Map<string, QueryPageRow[]>();
  for (const r of rows) {
    const key = r.query.toLowerCase();
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(r);
    map.set(key, list);
  }
  return map;
}

/** Stable fingerprint for idempotent upsert (page + top query).
 *
 * Signals change as metrics move between scans. Including them created a new Firestore
 * document for the same page/query and filled the queue with historical duplicates.
 */
export function opportunityFingerprint(args: {
  page: string;
  signals: OpportunitySignalKind[];
  query?: string | null;
}): string {
  const q = (args.query || '').toLowerCase().trim();
  return `${args.page.toLowerCase()}|${q}`;
}
