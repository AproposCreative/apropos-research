import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const find = vi.hoisted(() => vi.fn());
vi.mock('@/lib/podcast/public-episode', () => ({ findPublicEpisodeBySlug: find }));
import { GET } from '@/app/api/podcast/public/episode/route';

const request = (query = '?slug=example') => new NextRequest(`https://example.test/api/podcast/public/episode${query}`, {
  headers: { origin: 'https://www.aproposmagazine.com' },
});
beforeEach(() => { find.mockReset(); });

it('does not expose or cache internal storage errors', async () => {
  find.mockRejectedValue(new Error('private bucket credentials and internal stack'));
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBe('https://www.aproposmagazine.com');
  expect(await response.json()).toEqual({ ok: false, found: false, error: 'Kunne ikke hente episode' });
});
it('does not cache malformed requests or contact storage', async () => {
  const response = await GET(request(''));
  expect(response.status).toBe(400);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(find).not.toHaveBeenCalled();
});
it('preserves caching for successful lookups', async () => {
  find.mockResolvedValue(null);
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
  expect(await response.json()).toEqual({ ok: true, found: false, episode: null });
});
