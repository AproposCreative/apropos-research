import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access }));
vi.mock('@/lib/liv/shortening-baseline', () => ({ readLivShorteningBaseline: mocks.read }));
import { GET } from '@/app/api/liv/revisions/shortening/route';
const id = 'a'.repeat(24);
const request = (query = `?itemId=${id}`) => new NextRequest(`https://example.test/api/liv/revisions/shortening${query}`);
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ owner: true }); });
it.each([null, { owner: false, uid: 'milo' }, { owner: false, uid: 'casper' }])('denies unauthorized readers %j', async access => {
  mocks.access.mockResolvedValue(access);
  const response = await GET(request());
  expect(response.status).toBe(access ? 403 : 401);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.read).not.toHaveBeenCalled();
});
it.each(['', '?itemId=invalid', `?itemId=${id}&itemId=${id}`, `?itemId=${id}&uid=owner`])('rejects ambiguous or extra query %s', async query => {
  expect((await GET(request(query))).status).toBe(400); expect(mocks.read).not.toHaveBeenCalled();
});
it('returns the explicitly selected baseline without caching', async () => {
  mocks.read.mockResolvedValue({ itemId: id, wordCount: 600, publicationReady: false });
  const response = await GET(request());
  expect(response.status).toBe(200); expect(mocks.read).toHaveBeenCalledWith(id);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ itemId: id, wordCount: 600, publicationReady: false });
});
it.each([['liv_shortening_not_ready', 409], ['liv_shortening_configuration', 503], ['secret upstream data', 503]])('sanitizes errors %s', async (error, status) => {
  mocks.read.mockRejectedValue(new Error(String(error)));
  const response = await GET(request()); expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: String(error).startsWith('liv_shortening_') ? error : 'liv_shortening_failed' });
});
