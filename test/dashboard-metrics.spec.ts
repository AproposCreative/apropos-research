import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/ga4/google-auth', () => ({ getGa4AccessToken: async () => 'fixture-token' }));
vi.mock('@/lib/ga4/property', () => ({ getGa4PropertyResourceName: () => 'properties/fixture' }));
import { dashboardDateRange, periodToGa4Start } from '@/lib/dashboard/period';
import { fetchGoogleDiscovery, fetchArticleViewsBySlug, fetchTopArticles } from '@/lib/dashboard/ga4-reports';
import { buildNewsletterCampaigns } from '@/lib/dashboard/newsletter-data';
import type { NewsletterMessage, NewsletterTracking } from '@/lib/newsletter/engagement';
const tracking: NewsletterTracking = { openTracking: true, clickTracking: true, observedAt: '2026-10-30T12:00:00Z', openTrackingSince: '2026-10-30T12:00:00Z', clickTrackingSince: '2026-10-30T12:00:00Z' };
const message = (patch: Partial<NewsletterMessage> = {}): NewsletterMessage => ({ id: 'message1', recipient: 'a@example.test', subject: 'Ugens kultur', sentAt: '2026-10-30T13:00:00Z', campaign: 'week44', sendType: 'weekly_auto', isTest: false, testClassification: 'explicit', signals: { delivered: { at: '2026-10-30T13:00:01Z', source: 'webhook' } }, ...patch });
beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-10-30T14:00:00Z')));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('uses inclusive seven/28-day calendar ranges, with Copenhagen winter/summer offsets', () => {
  expect(periodToGa4Start('7d')).toBe('6daysAgo'); expect(periodToGa4Start('28d')).toBe('27daysAgo');
  expect(dashboardDateRange('28d')).toMatchObject({ startDate: '2026-10-03', endDate: '2026-10-30', startIso: '2026-10-02T22:00:00.000Z' });
  expect(dashboardDateRange('7d', new Date('2026-10-31T00:15:00Z'))).toMatchObject({ startDate: '2026-10-25', endDate: '2026-10-31', startIso: '2026-10-24T22:00:00.000Z' });
  expect(dashboardDateRange('7d', new Date('2026-03-31T10:00:00Z'))).toMatchObject({ startDate: '2026-03-25', startIso: '2026-03-24T23:00:00.000Z' });
});
it('requests period-level Search Console totals and all organic sessions, not one day/top sources', async () => {
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    if (body.metrics[0].name === 'organicGoogleSearchClicks') return Response.json({ rows: [['90','900','0.1'],['10','1000','0.01']].map(metrics => ({dimensionValues:[{value:'20261001'}],metricValues:metrics.map(value=>({value}))})) });
    const metrics = ['1500'];
    return Response.json({ rows: [{ dimensionValues: body.dimensions?.map(() => ({ value: 'google' })) ?? [], metricValues: metrics.map(value => ({ value })) }] });
  }));
  const result = await fetchGoogleDiscovery('28d');
  const gsc = bodies.find(b => b.metrics[0].name === 'organicGoogleSearchClicks');
  expect(gsc.dimensions).toEqual([{ name: 'date' }]); expect(gsc.limit).toBeUndefined(); expect(gsc.dateRanges[0]).toEqual({ startDate: '2026-10-03', endDate: '2026-10-30' });
  expect(result.clicks).toBe(100); expect(result.ctr).toBe(100/1900); expect(result.organicSessions).toBe(1500);
});
it('aggregates article paths beyond 200 titles for the author leaderboard', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body); expect(body.dimensions).toEqual([{ name: 'pagePath' }]); expect(body.limit).toBe(10000);
    return Response.json({ rows: [{ dimensionValues: [{ value: '/articles/book' }], metricValues: [{ value: '5' }] }, { dimensionValues: [{ value: '/articles/book/' }], metricValues: [{ value: '3' }] }] });
  }));
  expect((await fetchArticleViewsBySlug('28d')).get('book')).toBe(8);
});
it('ranks complete article view totals across changed titles and trailing slashes', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body); expect(body.limit).toBe(10000);
    expect(JSON.stringify(body.dimensionFilter)).toContain('page_view');
    return Response.json({ rows: [
      { dimensionValues: [{value:'/articles/other'},{value:'Other'}],metricValues:[{value:'8'}] },
      { dimensionValues: [{value:'/articles/book'},{value:'Current book title'}],metricValues:[{value:'6'}] },
      { dimensionValues: [{value:'/articles/book/'},{value:'Previous book title'}],metricValues:[{value:'5'}] },
    ] });
  }));
  expect(await fetchTopArticles('28d', 1)).toEqual([{path:'/articles/book',slug:'book',title:'Current book title',views:11}]);
});
it('keeps absent historical opens unknown rather than reporting zero or unread', () => {
  const old = message({ sentAt: '2026-10-23T13:00:00Z' });
  expect(buildNewsletterCampaigns([old], tracking)[0]).toMatchObject({ recipients: 1, delivered: 1, opened: null, clicked: null });
  expect(buildNewsletterCampaigns([message()], { ...tracking, openTracking: false, clickTracking: false })[0].opened).toBeNull();
});
it('counts unique message signals, excludes explicit tests and never infers an open from a click', () => {
  const clicked = message({ signals: { clicked: { at: '2026-10-30T13:01:00Z', source: 'webhook' } } });
  const result = buildNewsletterCampaigns([clicked, clicked, message({ id: 'test', isTest: true, sendType: 'manual_test' })], null);
  expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ recipients: 1, opened: null, clicked: 1, delivered: 0 });
  expect(result[0].messages[0].status).toBe('clicked');
});
