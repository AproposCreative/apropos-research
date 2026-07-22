import type { DashboardPeriod } from '@/lib/dashboard/period';
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
  overview: {
    activeUsers: number;
    pageViews: number;
    sessions: number;
  };
  newsletter: {
    /** Aktive modtagere (efter framelding). */
    signups: number;
    /** Alle tilmeldinger i Webflow (før framelding). */
    totalSignups: number;
    unsubscribed: number;
    source: string;
    error?: string;
  };
  articles: {
    total: number;
    published: number;
    drafts: number;
  };
  topArticles: Array<{ path: string; slug: string; title: string; views: number }>;
  viewsTrend: Array<{ date: string; views: number }>;
  trafficSources: Array<{ channel: string; sessions: number }>;
  google: Awaited<ReturnType<typeof fetchGoogleDiscovery>>;
  authorLeaderboard: Array<{
    authorId: string;
    name: string;
    avatar?: string;
    views: number;
    articleCount: number;
  }>;
  recommendations: string[];
};

export async function buildDashboardData(period: DashboardPeriod): Promise<DashboardPayload> {
  const [overview, topArticles, viewsTrend, trafficSources, google, articleCounts, recipients] =
    await Promise.all([
      fetchGa4Overview(period),
      fetchTopArticles(period, 15),
      fetchViewsTrend(period),
      fetchTrafficSources(period),
      fetchGoogleDiscovery(period),
      fetchArticleCounts(),
      getNewsletterRecipients(),
    ]);

  const viewsBySlug = await fetchArticleViewsBySlug(period);
  const authorLeaderboard = await buildAuthorLeaderboard(viewsBySlug);

  const recommendations = [
    ...(google.searchConsoleLinked
      ? []
      : [
          'Knyt Google Search Console til GA4 — så får I søgeord, klik og impressions i dashboardet.',
        ]),
    'Nyhedsbrev: åbnings- og klikrate (Resend → GA4) per udsendelse.',
    'Publiceringstempo: artikler pr. forfatter pr. måned.',
    'Læsetid / scroll-dybde på top-artikler (GA4 event).',
    'Signup-rate: artikelvisning → nyhedsbrev-tilmelding.',
    'App downloads: aktiveres når iOS-appen er i App Store.',
  ];

  return {
    period,
    generatedAt: new Date().toISOString(),
    overview,
    newsletter: {
      signups: recipients.emails.length,
      totalSignups: recipients.total,
      unsubscribed: recipients.unsubscribedCount,
      source: recipients.source,
      error: recipients.error,
    },
    articles: articleCounts,
    topArticles,
    viewsTrend,
    trafficSources,
    google,
    authorLeaderboard,
    recommendations,
  };
}
