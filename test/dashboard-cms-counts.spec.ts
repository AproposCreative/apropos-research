import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ apiToken: 'fixture', siteId: 'site', articlesCollectionId: 'articles' }) }));
vi.mock('@/lib/webflow-service', () => ({ getWebflowAuthors: async () => [{ id: 'author', name: 'Liv' }] }));
import { buildAuthorLeaderboard, fetchArticleCounts } from '@/lib/dashboard/webflow-stats';
afterEach(() => vi.unstubAllGlobals());
it('counts the live collection separately from staged drafts, retaining drafts with an older live version', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/items/live')) return Response.json({ pagination: { total: 2 }, items: [] });
    return Response.json({ items: [
      { id: 'live', fieldData: { slug: 'live' }, isDraft: false, lastPublished: '2026-10-01T12:00:00Z' },
      { id: 'pending-edit', fieldData: { slug: 'pending-edit' }, isDraft: true, lastPublished: '2026-10-01T12:00:00Z' },
      { id: 'never-published', fieldData: { slug: 'draft' }, isDraft: true },
    ] });
  }));
  expect(await fetchArticleCounts()).toEqual({ total: 3, published: 2, drafts: 2 });
  expect(fetch).toHaveBeenCalledWith('https://api.webflow.com/v2/collections/articles/items/live?limit=1', expect.any(Object));
});
it('does not substitute zero when live inventory cannot be verified', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/live') ? Response.json({}, { status: 503 }) : Response.json({ items: [] })));
  await expect(fetchArticleCounts()).rejects.toThrow('dashboard_live_cms_unavailable');
});
it('uses only actual live articles for the staff author leaderboard', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    expect(url).toContain('/items/live?');
    return Response.json({ items: [{ id: 'live-version', fieldData: { slug: 'book', author: 'author' }, isDraft: false }] });
  }));
  expect(await buildAuthorLeaderboard(new Map([['book', 42]]), true)).toEqual([{ authorId: 'author', name: 'Liv', views: 42, articleCount: 1 }]);
});
