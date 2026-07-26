/**
 * Server-side GSC/GA4 opportunity engine (swappable module).
 * Production default: automatic collect (daily) + optimize (weekly) when healthy.
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
import {
  fetchArticleItemByLocale,
  resolveWebflowLocaleIds,
} from '@/lib/webflow/locale-items';
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
import { OPPORTUNITY_MAX_APPLY_PER_RUN } from '@/lib/seo-engine/opportunity-engine/constants';
import { resolveAutomaticOpportunityRuntime } from '@/lib/seo-engine/opportunity-engine/settings';
import type {
  OpportunityScanMode,
  OpportunityScanReport,
  SeoOpportunity,
} from '@/lib/seo-engine/opportunity-engine/types';
import { inferArticleTypeHint } from '@/lib/seo-engine/archive-audit';

const SITE_ORIGIN = 'https://www.aproposmagazine.com';

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
};

function isoDaysAgo(days: number, now: Date): string {
  const dt = new Date(now.getTime());
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

function isoToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

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
  const result = await defaultGscFetch({
    siteUrl,
    token,
    body: {
      startDate: args.startDate,
      endDate: args.endDate,
      dimensions: ['query', 'page'],
      rowLimit: 2500,
      startRow: 0,
    },
  });
  if (result.ok === false) {
    return { ok: false, message: result.message };
  }
  return {
    ok: true,
    rows: result.rows.map((r) => ({
      query: (r.keys[0] || '').trim(),
      page: normalizePageKey(r.keys[1] || ''),
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
  };
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
  const windowDays = 28;
  const currentStart = isoDaysAgo(windowDays, now);
  const currentEnd = isoToday(now);
  const prevStart = isoDaysAgo(windowDays * 2, now);
  const prevEnd = isoDaysAgo(windowDays + 1, now);
  const defaultLimit = mode === 'optimize' ? OPPORTUNITY_MAX_APPLY_PER_RUN : 40;
  const limit = Math.min(
    mode === 'optimize' ? OPPORTUNITY_MAX_APPLY_PER_RUN : 80,
    Math.max(1, deps.limit || defaultLimit)
  );
  const persist = deps.persist !== false;
  const actor = deps.actor || 'system:opportunity-engine';
  const runtime = deps.runtime || (await resolveAutomaticOpportunityRuntime());

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
    windowDays,
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
    gscFetch({ startDate: currentStart, endDate: currentEnd }),
    gscFetch({ startDate: prevStart, endDate: prevEnd }),
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
    const g = await deps.loadGa4Fn(windowDays);
    ga4ByPath = g.byPath;
    ga4Status = g.setupStatus;
    ga4Configured = g.available;
  } else if (ga4Configured) {
    try {
      const g = await loadGa4PageIndex(windowDays);
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
  const { dk } = resolveWebflowLocaleIds();
  const slugs = getCmsSeoSlugs();

  const drafts: SeoOpportunity[] = [];

  for (const page of pages) {
    const path = normalizePathKey(page);
    const slug = slugFromPath(path);
    const item = slug ? slugToItem.get(slug.toLowerCase()) : undefined;
    if (!item) continue;

    let seoTitle: string | null = null;
    let metaDescription: string | null = null;
    let title = String(item.title || slug);
    let articleType: string | null = null;
    try {
      const live = await fetchFn(item.id, dk);
      const fd = (live.fieldData || {}) as Record<string, unknown>;
      title = String(fd.name || title);
      seoTitle = isCmsSeoFieldEmpty(fd[slugs.seoTitle])
        ? null
        : String(fd[slugs.seoTitle]).trim();
      metaDescription = isCmsSeoFieldEmpty(fd[slugs.metaDescription])
        ? null
        : String(fd[slugs.metaDescription]).trim();
      articleType =
        (typeof fd['article-type'] === 'string' && fd['article-type'].trim()) ||
        inferArticleTypeHint(slug, title, seoTitle || '');
    } catch {
      articleType = inferArticleTypeHint(slug, title, '');
    }

    const ga4 =
      ga4ByPath.get(path) ||
      (slug ? ga4ByPath.get(`slug:${slug}`) : undefined) ||
      null;

    const scored = scorePageOpportunity({
      page,
      currentRows,
      previousRows,
      queryToPages: queryIndex,
      seoTitle,
      metaDescription,
      ga4PageViews: ga4?.pageViews ?? null,
      ga4EngagedSessions: ga4?.engagedSessions ?? null,
    });
    if (!scored) continue;

    const workName = scored.query
      ? scored.query.replace(/\b(anmeldelse|anmeldelser|review|reviews)\b/gi, '').trim()
      : title;

    const proposals = buildSafeMetadataProposals({
      title,
      signals: scored.signals,
      evidence: scored.evidence,
      language: 'da',
      articleType,
      workName,
    });

    const fingerprint = opportunityFingerprint({
      page: scored.page,
      signals: scored.signals,
      query: scored.query,
    });

    const url = page.startsWith('http') ? page : `${SITE_ORIGIN}${path}`;
    const confidence = computeOpportunityConfidence({
      score: scored.score,
      signals: scored.signals,
      evidence: scored.evidence,
    });
    const idempotencyKey = buildIdempotencyKey({
      itemId: item.id,
      url,
      fingerprint,
      proposedTitle: proposals.find((p) => p.field === 'seoTitle')?.proposedValue,
      proposedMeta: proposals.find((p) => p.field === 'metaDescription')?.proposedValue,
    });

    drafts.push({
      id: '',
      articleKey: `wf:${item.id}`,
      itemId: item.id,
      locale: 'da',
      slug,
      title,
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
      articleType,
      workName,
      language: 'da',
      serverJsonLdHtml: null,
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
        id: createHash('sha256').update(d.fingerprint).digest('hex').slice(0, 32),
      });
    }
  }

  let status: OpportunityScanReport['status'] = 'ok';
  let statusMessage = `${mode === 'optimize' ? 'Optimize' : 'Collect'} OK — ${opportunities.length} muligheder (GSC ${currentRows.length} rækker)`;
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
    scannedPages: pages.length,
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
