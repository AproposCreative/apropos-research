import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ access: vi.fn(), recipients: vi.fn(), leaderboard: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mock.access }));
vi.mock('@/lib/dashboard/ga4-reports', () => ({
  fetchArticleViewsBySlug: async () => new Map(), fetchGa4Overview: async () => ({ activeUsers: 4, pageViews: 8, sessions: 5 }),
  fetchGoogleDiscovery: async () => ({ searchConsoleLinked: true }), fetchTopArticles: async () => [],
  fetchTrafficSources: async () => [], fetchViewsTrend: async () => [],
}));
vi.mock('@/lib/dashboard/webflow-stats', () => ({ buildAuthorLeaderboard: mock.leaderboard,
  fetchArticleCounts: async () => ({ total: 10, published: 7, drafts: 3 }) }));
vi.mock('@/lib/newsletter/get-recipients', () => ({ getNewsletterRecipients: mock.recipients }));
import { GET } from '@/app/api/dashboard/route';
beforeEach(() => {
  vi.resetAllMocks(); mock.access.mockResolvedValue({ uid: 'milo', owner: false });
  mock.leaderboard.mockResolvedValue([]);
  mock.recipients.mockResolvedValue({ emails: ['private@example.test'], total: 2, unsubscribedCount: 1, source: 'fixture' });
});
it('does not fetch restricted newsletter data for colleagues or reveal draft counts', async () => {
  const response = await GET(new NextRequest('https://example.test/api/dashboard?owner=true'));
  const { data } = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(data.articles).toEqual({ published: 7 });
  expect(data).not.toHaveProperty('newsletter');
  expect(mock.recipients).not.toHaveBeenCalled();
  expect(mock.leaderboard).toHaveBeenCalledWith(new Map(), true);
});
it('keeps the owner dashboard aggregates without exposing recipient addresses', async () => {
  mock.access.mockResolvedValue({ uid: 'frederik', owner: true });
  const data = await (await GET(new NextRequest('https://example.test/api/dashboard'))).json();
  expect(data.data.newsletter.signups).toBe(1);
  expect(data.data.articles.drafts).toBe(3);
  expect(JSON.stringify(data)).not.toContain('private@example.test');
  expect(mock.leaderboard).toHaveBeenCalledWith(new Map(), false);
});
it('requires verified editorial access and hides upstream errors', async () => {
  mock.access.mockResolvedValue(null);
  expect((await GET(new NextRequest('https://example.test/api/dashboard'))).status).toBe(401);
  expect(mock.leaderboard).not.toHaveBeenCalled();
  mock.access.mockResolvedValue({ uid: 'frederik', owner: true });
  mock.recipients.mockRejectedValue(new Error('sensitive upstream error'));
  const response = await GET(new NextRequest('https://example.test/api/dashboard'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false, error: 'Dashboard kunne ikke hentes.' });
});
