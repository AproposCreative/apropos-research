import { dashboardDateRange, type DashboardPeriod } from '@/lib/dashboard/period';
import {
  fetchArticleViewsBySlug,
  fetchGa4Overview,
  fetchGoogleDiscovery,
  fetchTopArticles,
  fetchTrafficSources,
  fetchViewsTrend,
} from '@/lib/dashboard/ga4-reports';
import { buildAuthorLeaderboard, fetchArticleCounts } from '@/lib/dashboard/webflow-stats';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';

export type DashboardPayload = {
  period: DashboardPeriod;
  generatedAt: string;
  range: ReturnType<typeof dashboardDateRange>;
  availability: Record<string, boolean>;
  overview: {
    activeUsers: number;
    pageViews: number;
    sessions: number;
  } | null;
  newsletter?: {
    /** Aktive modtagere (efter framelding). */
    signups: number | null;
    /** Alle tilmeldinger i Webflow (før framelding). */
    totalSignups: number | null;
    unsubscribed: number;
    source: string;
    error?: string;
  };
  articles: {
    total?: number;
    published: number | null;
    drafts?: number;
  };
  topArticles: Array<{ path: string; slug: string; title: string; views: number }>;
  viewsTrend: Array<{ date: string; views: number }>;
  trafficSources: Array<{ channel: string; sessions: number }>;
  google: Omit<Awaited<ReturnType<typeof fetchGoogleDiscovery>>, 'organicSessions'> & { organicSessions: number | null };
  authorLeaderboard: Array<{
    authorId: string;
    name: string;
    avatar?: string;
    views: number;
    articleCount: number;
  }>;
  recommendations: string[];
};

export async function buildDashboardData(period: DashboardPeriod, owner = false): Promise<DashboardPayload> {
  const [overview, topArticles, viewsTrend, trafficSources, google, articleCounts, recipients, viewsBySlug] =
    await Promise.allSettled([
      fetchGa4Overview(period), fetchTopArticles(period, 15), fetchViewsTrend(period), fetchTrafficSources(period),
      fetchGoogleDiscovery(period), fetchArticleCounts(), owner ? getNewsletterRecipients() : Promise.resolve(null),
      fetchArticleViewsBySlug(period),
    ]);
  let authorLeaderboard: DashboardPayload['authorLeaderboard'] = [];
  let authorsAvailable = false;
  if (viewsBySlug.status === 'fulfilled') {
    try { authorLeaderboard = await buildAuthorLeaderboard(viewsBySlug.value, !owner); authorsAvailable = true; } catch { /* source unavailable */ }
  }
  const r = recipients.status === 'fulfilled' ? recipients.value : null;
  const newsletterVerified = r && r.verified !== false && !r.error;
  const emptyGoogle: DashboardPayload['google'] = { organicSessions: null, searchConsoleLinked: false, clicks: null, impressions: null, ctr: null,
    searchQueriesAvailable: false, searchQueriesNote: 'Google-data kunne ikke hentes.', sources: [], googleSources: [], topLandingPages: [] };
  return {
    period, generatedAt: new Date().toISOString(), range: dashboardDateRange(period),
    availability: { overview: overview.status === 'fulfilled', articles: articleCounts.status === 'fulfilled',
      topArticles: topArticles.status === 'fulfilled', viewsTrend: viewsTrend.status === 'fulfilled',
      trafficSources: trafficSources.status === 'fulfilled', google: google.status === 'fulfilled', authors: authorsAvailable },
    overview: overview.status === 'fulfilled' ? overview.value : null,
    ...(owner ? { newsletter: { signups: newsletterVerified ? r!.emails.length : null,
      totalSignups: r && r.verified !== false ? r.total : null, unsubscribed: r?.unsubscribedCount ?? 0,
      source: r?.source ?? 'none', ...(!newsletterVerified ? { error: 'Tilmeldingerne kunne ikke verificeres.' } : {}) } } : {}),
    articles: articleCounts.status === 'fulfilled' ? owner ? articleCounts.value : { published: articleCounts.value.published } : { published: null },
    topArticles: topArticles.status === 'fulfilled' ? topArticles.value : [],
    viewsTrend: viewsTrend.status === 'fulfilled' ? viewsTrend.value : [],
    trafficSources: trafficSources.status === 'fulfilled' ? trafficSources.value : [],
    google: google.status === 'fulfilled' ? google.value : emptyGoogle,
    authorLeaderboard, recommendations: [],
  };
}
