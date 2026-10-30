import { getGa4AccessToken } from '@/lib/ga4/google-auth';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';
import type { DashboardPeriod } from '@/lib/dashboard/period';
import { dashboardDateRange } from '@/lib/dashboard/period';

type Ga4Row = { dimensions: string[]; metrics: string[] };

async function ga4Run(body: Record<string, unknown>): Promise<Ga4Row[]> {
  // Traffic measures website page views, not newsletter Measurement Protocol
  // delivery/open events. Search Console metrics have their own aggregation.
  const metrics = body.metrics as Array<{ name: string }>;
  if (!metrics.some(metric => metric.name.startsWith('organicGoogleSearch'))) {
    const pageView = { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'page_view' } } };
    body = { ...body, dimensionFilter: body.dimensionFilter ? { andGroup: { expressions: [body.dimensionFilter, pageView] } } : pageView };
  }
  const property = getGa4PropertyResourceName();
  if (!property) throw new Error('GA4_PROPERTY_ID er ikke sat');

  const token = await getGa4AccessToken();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.error as { message?: string } | undefined)?.message || `GA4 ${res.status}`;
    throw new Error(msg);
  }
  const rows = (json.rows as Array<Record<string, unknown>>) || [];
  return rows.map((row) => ({
    dimensions: ((row.dimensionValues as Array<{ value?: string }>) || []).map((v) => v.value ?? ''),
    metrics: ((row.metricValues as Array<{ value?: string }>) || []).map((v) => v.value ?? ''),
  }));
}

function num(v: string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchGa4Overview(period: DashboardPeriod) {
  const { startDate, endDate } = dashboardDateRange(period);
  const rows = await ga4Run({
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'sessions' },
    ],
  });
  const m = rows[0]?.metrics || [];
  return {
    activeUsers: num(m[0]),
    pageViews: num(m[1]),
    sessions: num(m[2]),
  };
}

export async function fetchTopArticles(period: DashboardPeriod, limit = 12) {
  const { startDate, endDate } = dashboardDateRange(period);
  const rows = await ga4Run({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'BEGINS_WITH', value: '/articles/' },
      },
    },
    orderBys: [{ desc: true, metric: { metricName: 'screenPageViews' } }],
    // A title change creates another GA4 row for the same article. Aggregate
    // before ranking so old/new titles and trailing slashes don't split views.
    limit: 10000,
  });

  const articles = new Map<string, { path: string; slug: string; title: string; views: number }>();
  for (const r of rows) {
    const path = (r.dimensions[0] || '').replace(/\/$/, '');
    const slug = path.replace(/^\/articles\//, '').replace(/\/$/, '');
    const previous = articles.get(path);
    articles.set(path, {
      path, slug,
      // Rows are ordered by views; retain the most frequently observed title.
      title: previous?.title || (r.dimensions[1] || '').replace(/^Apropos Magazine:\s*/i, '').trim(),
      views: (previous?.views ?? 0) + num(r.metrics[0]),
    });
  }
  return [...articles.values()].sort((a, b) => b.views - a.views).slice(0, limit);
}

export async function fetchViewsTrend(period: DashboardPeriod) {
  const { startDate, endDate } = dashboardDateRange(period);
  const rows = await ga4Run({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });
  return rows.map((r) => ({
    date: r.dimensions[0] || '',
    views: num(r.metrics[0]),
  }));
}

export async function fetchTrafficSources(period: DashboardPeriod, limit = 8) {
  const { startDate, endDate } = dashboardDateRange(period);
  const rows = await ga4Run({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });
  return rows.map((r) => ({
    channel: r.dimensions[0] || 'Ukendt',
    sessions: num(r.metrics[0]),
  }));
}

async function tryGscTotals(startDate: string, endDate: string): Promise<{
  linked: boolean;
  clicks: number;
  impressions: number;
  ctr: number;
}> {
  try {
    const rows = await ga4Run({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'organicGoogleSearchClicks' },
        { name: 'organicGoogleSearchImpressions' },
        { name: 'organicGoogleSearchClickThroughRate' },
      ],
    });
    const clicks = rows.reduce((sum, row) => sum + num(row.metrics[0]), 0);
    const impressions = rows.reduce((sum, row) => sum + num(row.metrics[1]), 0);
    return {
      linked: true,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
    };
  } catch {
    return { linked: false, clicks: 0, impressions: 0, ctr: 0 };
  }
}

export async function fetchGoogleDiscovery(period: DashboardPeriod) {
  const { startDate, endDate } = dashboardDateRange(period);
  const [sources, landing, gscTotals, organicTotal] = await Promise.all([
    ga4Run({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionMedium',
          stringFilter: { matchType: 'EXACT', value: 'organic' },
        },
      },
      orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
      limit: 10,
    }),
    ga4Run({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'landingPagePlusQueryString' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionMedium',
          stringFilter: { matchType: 'EXACT', value: 'organic' },
        },
      },
      orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
      limit: 8,
    }),
    tryGscTotals(startDate, endDate),
    ga4Run({ dateRanges: [{ startDate, endDate }], metrics: [{ name: 'sessions' }],
      dimensionFilter: { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'organic' } } } }),
  ]);

  const organicSessions = num(organicTotal[0]?.metrics[0]);
  const googleSources = sources
    .filter((r) => (r.dimensions[0] || '').toLowerCase().includes('google'))
    .map((r) => ({
      source: r.dimensions[0] || '',
      medium: r.dimensions[1] || '',
      sessions: num(r.metrics[0]),
    }));

  return {
    organicSessions,
    searchConsoleLinked: gscTotals.linked,
    clicks: gscTotals.linked ? gscTotals.clicks : null,
    impressions: gscTotals.linked ? gscTotals.impressions : null,
    ctr: gscTotals.linked ? gscTotals.ctr : null,
    searchQueriesAvailable: false,
    searchQueriesNote: gscTotals.linked
      ? 'Søgetal fra GA4 for hele perioden. Google kan være forsinket med de seneste dage.'
      : 'Søgetal er ikke tilgængelige fra GA4. Det kan skyldes adgang eller manglende dataforbindelse.',
    sources: sources.map((r) => ({
      source: r.dimensions[0] || '',
      medium: r.dimensions[1] || '',
      sessions: num(r.metrics[0]),
    })),
    googleSources,
    topLandingPages: landing.map((r) => ({
      path: r.dimensions[0] || '',
      sessions: num(r.metrics[0]),
    })),
  };
}

/** Aggreger page views per article slug for forfatter-leaderboard. */
export async function fetchArticleViewsBySlug(period: DashboardPeriod): Promise<Map<string, number>> {
  const { startDate, endDate } = dashboardDateRange(period);
  const rows = await ga4Run({ dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }], limit: 10000,
    dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/articles/' } } } });
  const map = new Map<string, number>();
  for (const row of rows) {
    const slug = (row.dimensions[0] || '').replace(/^\/articles\//, '').replace(/\/$/, '');
    if (slug) map.set(slug, (map.get(slug) ?? 0) + num(row.metrics[0]));
  }
  return map;
}
