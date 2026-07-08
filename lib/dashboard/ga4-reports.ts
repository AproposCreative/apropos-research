import { getGa4AccessToken } from '@/lib/ga4/google-auth';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';
import type { DashboardPeriod } from '@/lib/dashboard/period';
import { periodToGa4Start } from '@/lib/dashboard/period';

type Ga4Row = { dimensions: string[]; metrics: string[] };

async function ga4Run(body: Record<string, unknown>): Promise<Ga4Row[]> {
  const property = getGa4PropertyResourceName();
  if (!property) throw new Error('GA4_PROPERTY_ID er ikke sat');

  const token = await getGa4AccessToken();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  const startDate = periodToGa4Start(period);
  const rows = await ga4Run({
    dateRanges: [{ startDate, endDate: 'today' }],
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
  const startDate = periodToGa4Start(period);
  const rows = await ga4Run({
    dateRanges: [{ startDate, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'BEGINS_WITH', value: '/articles/' },
      },
    },
    orderBys: [{ desc: true, metric: { metricName: 'screenPageViews' } }],
    limit,
  });

  return rows.map((r) => {
    const path = r.dimensions[0] || '';
    const slug = path.replace(/^\/articles\//, '').replace(/\/$/, '');
    return {
      path,
      slug,
      title: (r.dimensions[1] || '').replace(/^Apropos Magazine:\s*/i, '').trim(),
      views: num(r.metrics[0]),
    };
  });
}

export async function fetchViewsTrend(period: DashboardPeriod) {
  const startDate = periodToGa4Start(period);
  const rows = await ga4Run({
    dateRanges: [{ startDate, endDate: 'today' }],
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
  const startDate = periodToGa4Start(period);
  const rows = await ga4Run({
    dateRanges: [{ startDate, endDate: 'today' }],
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

async function tryGscTotals(startDate: string): Promise<{
  linked: boolean;
  clicks: number;
  impressions: number;
  ctr: number;
}> {
  try {
    const rows = await ga4Run({
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'organicGoogleSearchClicks' },
        { name: 'organicGoogleSearchImpressions' },
        { name: 'organicGoogleSearchClickThroughRate' },
      ],
      limit: 1,
    });
    const m = rows[0]?.metrics || [];
    return {
      linked: true,
      clicks: num(m[0]),
      impressions: num(m[1]),
      ctr: num(m[2]),
    };
  } catch {
    return { linked: false, clicks: 0, impressions: 0, ctr: 0 };
  }
}

export async function fetchGoogleDiscovery(period: DashboardPeriod) {
  const startDate = periodToGa4Start(period);
  const [sources, landing, gscTotals] = await Promise.all([
    ga4Run({
      dateRanges: [{ startDate, endDate: 'today' }],
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
      dateRanges: [{ startDate, endDate: 'today' }],
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
    tryGscTotals(startDate),
  ]);

  const organicSessions = sources.reduce((sum, r) => sum + num(r.metrics[0]), 0);
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
    searchQueriesAvailable: gscTotals.linked,
    searchQueriesNote: gscTotals.linked
      ? 'Søgeord fra Search Console (via GA4).'
      : 'Knyt Search Console til property 484743571 i GA4 Admin → Product links for søgeord, klik og impressions.',
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
  const articles = await fetchTopArticles(period, 200);
  const map = new Map<string, number>();
  for (const a of articles) {
    if (a.slug) map.set(a.slug, a.views);
  }
  return map;
}
