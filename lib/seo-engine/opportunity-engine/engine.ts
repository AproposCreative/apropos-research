/**
 * Server-side GSC/GA4 opportunity engine (swappable module).
 * Production default: automatic collect (daily) + optimize (weekly) when healthy.
 * Supports both /articles (da) and /en/articles (en) with matching Webflow locales.
 */

import { createHash } from 'node:crypto';
import { getGa4AccessToken } from '@/lib/ga4/google-auth';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';
import { getConfiguredGscSiteUrl, getGscAccessToken } from '@/lib/gsc/google-auth';
import {
  normalizePageKey,
  normalizePathKey,
  slugFromPath,
  loadGa4PageIndex,
  type Ga4PageMetric,
} from '@/lib/seo-engine/archive-audit';
import { getCmsSeoSlugs, isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
import { listDkArticleItems, type ListedArticleItem } from '@/lib/seo-engine/overwrite-backfill';
import { fetchArticleItemByLocale } from '@/lib/webflow/locale-items';
import { defaultGscFetch } from '@/lib/seo-engine/search-signals';
import { buildSafeMetadataProposals } from '@/lib/seo-engine/opportunity-engine/proposals';
import {
  buildQueryToPagesIndex,
  opportunityFingerprint,
  scorePageOpportunity,
  type QueryPageRow,
} from '@/lib/seo-engine/opportunity-engine/scoring';
import {
  appendAudit,
  saveScanSummary,
  upsertOpportunity,
} from '@/lib/seo-engine/opportunity-engine/store';
import {
  buildIdempotencyKey,
  computeOpportunityConfidence,
} from '@/lib/seo-engine/opportunity-engine/guardrails';
import {
  OPPORTUNITY_MAX_APPLY_PER_RUN,
  OPPORTUNITY_WEBFLOW_CONCURRENCY,
  OPPORTUNITY_WEBFLOW_FETCH_CAP,
} from '@/lib/seo-engine/opportunity-engine/constants';
import { resolveAutomaticOpportunityRuntime } from '@/lib/seo-engine/opportunity-engine/settings';
import {
  buildGscCompareWindows,
  GSC_PAGE_SIZE,
  GSC_ROW_CAP,
} from '@/lib/seo-engine/opportunity-engine/gsc-windows';
import { mapWithConcurrency } from '@/lib/seo-engine/opportunity-engine/concurrency';
import {
  cmsLocaleIdFor,
  languageForLocale,
  resolveLocaleFromPageUrl,
} from '@/lib/seo-engine/opportunity-engine/locale';
import type {
  OpportunityScanMode,
  OpportunityScanReport,
  SeoOpportunity,
} from '@/lib/seo-engine/opportunity-engine/types';
import { inferArticleTypeHint } from '@/lib/seo-engine/archive-audit';

export type OpportunityEngineDeps = {
  listFn?: () => Promise<ListedArticleItem[]>;
  fetchFn?: typeof fetchArticleItemByLocale;
  gscFetchRows?: (args: {
    startDate: string;
    endDate: string;
  }) => Promise<{ ok: true; rows: QueryPageRow[] } | { ok: false; message: string }>;
  loadGa4Fn?: (days: number) => Promise<{
    byPath: Map<string, Ga4PageMetric>;
    available: boolean;
    setupStatus: string;
  }>;
  persist?: boolean;
  now?: () => Date;
  actor?: string;
  limit?: number;
  mode?: OpportunityScanMode;
  runtime?: Awaited<ReturnType<typeof resolveAutomaticOpportunityRuntime>>;
  webflowConcurrency?: number;
  webflowFetchCap?: number;
};

async function defaultGscRows(args: {
  startDate: string;
  endDate: string;
}): Promise<{ ok: true; rows: QueryPageRow[] } | { ok: false; message: string }> {
  const siteUrl = getConfiguredGscSiteUrl();
  if (!siteUrl) return { ok: false, message: 'GSC_SITE_URL mangler' };
  let token: string;
  try {
    token = await getGscAccessToken();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'GSC auth failed' };
  }

  const all: QueryPageRow[] = [];
  let startRow = 0;
  while (all.length < GSC_ROW_CAP) {
    const result = await defaultGscFetch({
      siteUrl,
      token,
      body: {
        startDate: args.startDate,
        endDate: args.endDate,
        dimensions: ['query', 'page'],
        rowLimit: GSC_PAGE_SIZE,
        startRow,
      },
    });
    if (result.ok === false) {
      return { ok: false, message: result.message };
    }
    for (const r of result.rows) {
      all.push({
        query: (r.keys[0] || '').trim(),
        page: normalizePageKey(r.keys[1] || ''),
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      });
      if (all.length >= GSC_ROW_CAP) break;
    }
    if (result.rows.length < GSC_PAGE_SIZE) break;
    startRow += GSC_PAGE_SIZE;
  }
  return { ok: true, rows: all.slice(0, GSC_ROW_CAP) };
}

/**
 * Run opportunity scan (collect or optimize prep).
 * Never invents mock GSC/GA4 data.
 */
export async function runOpportunityScan(
  deps: OpportunityEngineDeps = {}
): Promise<OpportunityScanReport> {
  const now = deps.now?.() || new Date();
  const mode: OpportunityScanMode = deps.mode || 'collect';
  const scanId = createHash('sha256')
    .update(`opp-scan:${mode}:${now.toISOString()}:${deps.actor || 'system'}`)
    .digest('hex')
    .slice(0, 20);
  const windows = buildGscCompareWindows({ now });
  const defaultLimit = mode === 'optimize' ? OPPORTUNITY_MAX_APPLY_PER_RUN : 40;
  const limit = Math.min(
    mode === 'optimize' ? OPPORTUNITY_MAX_APPLY_PER_RUN : 80,
    Math.max(1, deps.limit || defaultLimit)
  );
  const persist = deps.persist !== false;
  const actor = deps.actor || 'system:opportunity-engine';
  const runtime = deps.runtime || (await resolveAutomaticOpportunityRuntime());
  const fetchCap = deps.webflowFetchCap ?? OPPORTUNITY_WEBFLOW_FETCH_CAP;
  const concurrency = deps.webflowConcurrency ?? OPPORTUNITY_WEBFLOW_CONCURRENCY;

  const gscConfigured = Boolean(getConfiguredGscSiteUrl());
  let ga4Configured = Boolean(getGa4PropertyResourceName());
  try {
    if (ga4Configured) await getGa4AccessToken();
  } catch {
    ga4Configured = false;
  }

  const baseReport = (partial: Partial<OpportunityScanReport>): OpportunityScanReport => ({
    schemaVersion: 2,
    kind: 'seo-opportunity-scan',
    scanId,
    createdAt: now.toISOString(),
    windowDays: windows.windowDays,
    mode,
    status: 'error',
    statusMessage: '',
    gscConfigured,
    ga4Configured,
    autoEnabled: runtime.killSwitchEnabled,
    scannedPages: 0,
    opportunityCount: 0,
    opportunities: [],
    ...partial,
  });

  if (!runtime.killSwitchEnabled) {
    const report = baseReport({
      status: 'auto_disabled',
      statusMessage: 'Nød-stop aktiv — automatisk optimering er deaktiveret',
    });
    if (persist) {
      await saveScanSummary({
        scanId,
        status: report.status,
        statusMessage: report.statusMessage,
        opportunityCount: 0,
        source: actor,
      });
      await appendAudit({
        actor,
        action: 'emergency_stop',
        detail: report.statusMessage,
      });
    }
    return report;
  }

  const gscFetch = deps.gscFetchRows || defaultGscRows;
  const [currentRes, prevRes] = await Promise.all([
    gscFetch({ startDate: windows.currentStart, endDate: windows.currentEnd }),
    gscFetch({ startDate: windows.previousStart, endDate: windows.previousEnd }),
  ]);

  if (currentRes.ok === false) {
    const gscMessage = currentRes.message;
    const report = baseReport({
      status: gscConfigured ? 'error' : 'missing_gsc',
      statusMessage: gscMessage,
    });
    if (persist) {
      await saveScanSummary({
        scanId,
        status: report.status,
        statusMessage: report.statusMessage,
        opportunityCount: 0,
        source: actor,
      });
      await appendAudit({
        actor,
        action: mode === 'optimize' ? 'optimize' : 'collect',
        detail: `status=${report.status} ${report.statusMessage}`,
      });
    }
    return report;
  }

  if (mode === 'optimize' && !runtime.shouldAutoOptimize) {
    return baseReport({
      status: 'connections_unhealthy',
      statusMessage: runtime.connectionSummary,
    });
  }

  const currentRows = currentRes.rows.filter((r) => r.page);
  const previousRows = prevRes.ok ? prevRes.rows.filter((r) => r.page) : [];

  let ga4ByPath = new Map<string, Ga4PageMetric>();
  let ga4Status = ga4Configured ? 'ok' : 'GA4_PROPERTY_ID mangler';
  if (deps.loadGa4Fn) {
    const g = await deps.loadGa4Fn(windows.windowDays);
    ga4ByPath = g.byPath;
    ga4Status = g.setupStatus;
    ga4Configured = g.available;
  } else if (ga4Configured) {
    try {
      const g = await loadGa4PageIndex(windows.windowDays);
      ga4ByPath = g.byPath;
      ga4Status = g.provenance?.setupStatus || 'ok';
      ga4Configured = Boolean(g.provenance?.available);
    } catch (e) {
      ga4Configured = false;
      ga4Status = e instanceof Error ? e.message : 'GA4 load failed';
    }
  }

  const listFn = deps.listFn || listDkArticleItems;
  const fetchFn = deps.fetchFn || fetchArticleItemByLocale;
  const listed = await listFn();
  const published = listed
    .filter((it) => !it.isDraft && it.lastPublished)
    .sort((a, b) => String(b.lastPublished).localeCompare(String(a.lastPublished)))
    .slice(0, 200);

  const slugToItem = new Map<string, ListedArticleItem>();
  for (const it of published) {
    const slug = String(it.slug || '').trim();
    if (slug) slugToItem.set(slug.toLowerCase(), it);
  }

  const pages = [...new Set(currentRows.map((r) => r.page))];
  const queryIndex = buildQueryToPagesIndex(currentRows);
  const slugs = getCmsSeoSlugs();

  // Candidate filter: match locale+slug, rank by impressions, bound Webflow fetches
  type Candidate = {
    page: string;
    path: string;
    slug: string;
    locale: 'da' | 'en';
    item: ListedArticleItem;
    impressions: number;
  };
  const candidates: Candidate[] = [];
  for (const page of pages) {
    const locale = resolveLocaleFromPageUrl(page);
    if (!locale) continue;
    const path = normalizePathKey(page);
    const slug = slugFromPath(path);
    if (!slug) continue;
    const item = slugToItem.get(slug.toLowerCase());
    if (!item) continue;
    const impressions = currentRows
      .filter((r) => r.page === page)
      .reduce((s, r) => s + (r.impressions || 0), 0);
    candidates.push({ page, path, slug, locale, item, impressions });
  }
  candidates.sort((a, b) => b.impressions - a.impressions);
  const toFetch = candidates.slice(0, Math.max(limit, fetchCap));

  type Fetched = Candidate & {
    title: string;
    seoTitle: string | null;
    metaDescription: string | null;
    articleType: string | null;
    cmsLastUpdated: string | null;
    bodyExcerpt: string | null;
  };

  const fetched = await mapWithConcurrency(
    toFetch,
    concurrency,
    async (c): Promise<Fetched | null> => {
      const cmsLocaleId = cmsLocaleIdFor(c.locale);
      try {
        const live = await fetchFn(c.item.id, cmsLocaleId);
        const fd = (live.fieldData || {}) as Record<string, unknown>;
        const title = String(fd.name || c.item.title || c.slug);
        const seoTitle = isCmsSeoFieldEmpty(fd[slugs.seoTitle])
          ? null
          : String(fd[slugs.seoTitle]).trim();
        const metaDescription = isCmsSeoFieldEmpty(fd[slugs.metaDescription])
          ? null
          : String(fd[slugs.metaDescription]).trim();
        const articleType =
          (typeof fd['article-type'] === 'string' && fd['article-type'].trim()) ||
          inferArticleTypeHint(c.slug, title, seoTitle || '');
        const body =
          typeof fd.content === 'string'
            ? fd.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
            : null;
        return {
          ...c,
          title,
          seoTitle,
          metaDescription,
          articleType,
          cmsLastUpdated: live.lastUpdated || live.lastPublished || null,
          bodyExcerpt: body,
        };
      } catch {
        return {
          ...c,
          title: String(c.item.title || c.slug),
          seoTitle: null,
          metaDescription: null,
          articleType: inferArticleTypeHint(c.slug, c.item.title || c.slug, ''),
          cmsLastUpdated: c.item.lastUpdated || c.item.lastPublished || null,
          bodyExcerpt: null,
        };
      }
    }
  );

  const drafts: SeoOpportunity[] = [];

  for (const row of fetched) {
    if (!row) continue;
    const ga4 =
      ga4ByPath.get(row.path) ||
      ga4ByPath.get(`slug:${row.slug}`) ||
      null;

    const scored = scorePageOpportunity({
      page: row.page,
      currentRows,
      previousRows,
      queryToPages: queryIndex,
      seoTitle: row.seoTitle,
      metaDescription: row.metaDescription,
      ga4PageViews: ga4?.pageViews ?? null,
      ga4EngagedSessions: ga4?.engagedSessions ?? null,
    });
    if (!scored) continue;

    const language = languageForLocale(row.locale);
    const workName = scored.query
      ? scored.query.replace(/\b(anmeldelse|anmeldelser|review|reviews)\b/gi, '').trim()
      : row.title;

    const proposals = buildSafeMetadataProposals({
      title: row.title,
      signals: scored.signals,
      evidence: scored.evidence,
      language,
      articleType: row.articleType,
      workName,
      bodyExcerpt: row.bodyExcerpt,
    });

    const fingerprint = opportunityFingerprint({
      page: scored.page,
      signals: scored.signals,
      query: scored.query,
    });

    const confidence = computeOpportunityConfidence({
      score: scored.score,
      signals: scored.signals,
      evidence: scored.evidence,
    });
    const idempotencyKey = buildIdempotencyKey({
      itemId: row.item.id,
      url: row.page.startsWith('http') ? row.page : `https://www.aproposmagazine.com${row.path}`,
      fingerprint,
      proposedTitle: proposals.find((p) => p.field === 'seoTitle')?.proposedValue,
      proposedMeta: proposals.find((p) => p.field === 'metaDescription')?.proposedValue,
    });

    const url = row.page.startsWith('http')
      ? row.page
      : `https://www.aproposmagazine.com${row.path}`;

    drafts.push({
      id: '',
      articleKey: `wf:${row.item.id}:${row.locale}`,
      itemId: row.item.id,
      locale: row.locale,
      slug: row.slug,
      title: row.title,
      url,
      status: 'open',
      score: scored.score,
      confidence,
      signals: scored.signals,
      why: scored.why,
      evidence: scored.evidence,
      proposals,
      fingerprint,
      idempotencyKey,
      scanId,
      articleType: row.articleType,
      workName,
      language,
      serverJsonLdHtml: null,
      scannedCmsLastUpdated: row.cmsLastUpdated,
      scannedSeoTitle: row.seoTitle,
      scannedMetaDescription: row.metaDescription,
    });
  }

  drafts.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  const top = drafts.slice(0, limit);

  const opportunities: SeoOpportunity[] = [];
  if (persist) {
    for (const d of top) {
      opportunities.push(await upsertOpportunity(d));
    }
  } else {
    for (const d of top) {
      opportunities.push({
        ...d,
        id: createHash('sha256').update(`${d.fingerprint}:${d.locale}`).digest('hex').slice(0, 32),
      });
    }
  }

  let status: OpportunityScanReport['status'] = 'ok';
  let statusMessage = `${mode === 'optimize' ? 'Optimize' : 'Collect'} OK — ${opportunities.length} muligheder (GSC ${currentRows.length} rækker, lag ${windows.lagDays}d, ${windows.currentStart}→${windows.currentEnd})`;
  if (!ga4Configured) {
    status = 'partial';
    statusMessage += `. GA4 utilgængelig: ${ga4Status}`;
  }
  if (currentRows.length === 0) {
    status = 'partial';
    statusMessage = 'GSC returnerede 0 rækker — ingen mock-data genereret';
  }

  const report = baseReport({
    status,
    statusMessage,
    gscConfigured: true,
    ga4Configured,
    scannedPages: toFetch.length,
    opportunityCount: opportunities.length,
    opportunities,
  });

  if (persist) {
    await saveScanSummary({
      scanId,
      status: report.status,
      statusMessage: report.statusMessage,
      opportunityCount: report.opportunityCount,
      source: actor,
    });
    await appendAudit({
      actor,
      action: mode === 'optimize' ? 'optimize' : 'collect',
      detail: `scanId=${scanId} count=${report.opportunityCount} status=${report.status}`,
    });
  }

  return report;
}
