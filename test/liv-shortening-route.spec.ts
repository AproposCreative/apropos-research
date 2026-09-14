import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), shorten: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access }));
vi.mock('@/lib/liv/shortening-baseline', () => ({ readLivShorteningBaseline: mocks.read }));
vi.mock('@/lib/liv/request-shortening', () => ({ requestLivShortening: mocks.shorten }));
import { GET, POST } from '@/app/api/liv/revisions/shortening/route';
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
const input = { itemId: id, requestId: 'shorten-owner-01', expectedPayloadHash: 'b'.repeat(64), expectedCmsHash: 'c'.repeat(64), targetWords: 500 };
const post = (body: unknown = input, query = '') => new NextRequest(`https://example.test/api/liv/revisions/shortening${query}`, { method: 'POST', body: JSON.stringify(body) });
it.each([null, { owner: false }])('denies unprivileged generation %j', async access => {
  mocks.access.mockResolvedValue(access);
  expect((await POST(post())).status).toBe(access ? 403 : 401); expect(mocks.shorten).not.toHaveBeenCalled();
});
it.each([{ ...input, article: { content: 'Client prose' } }, { ...input, model: 'override' },
  { ...input, targetWords: 300 }, { ...input, requestId: 'x' }, { ...input, extra: 'x'.repeat(2100) }])('rejects expanded generation input', async value => {
  expect((await POST(post(value))).status).toBe(400); expect(mocks.shorten).not.toHaveBeenCalled();
});
it('rejects generation query overrides', async () => {
  expect((await POST(post(input, '?uid=owner'))).status).toBe(400); expect(mocks.shorten).not.toHaveBeenCalled();
});
it('preserves request identity and returns a private preview', async () => {
  mocks.shorten.mockResolvedValue({ status: 'preview', publicationReady: false });
  const response = await POST(post());
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.shorten).toHaveBeenCalledWith(input);
  expect(await response.json()).toEqual({ status: 'preview', publicationReady: false });
});
it('does not disclose provider failures', async () => {
  mocks.shorten.mockRejectedValue(new Error('private provider response'));
  const response = await POST(post()); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'liv_shortening_failed', publicationReady: false });
});
it('distinguishes proven pretransport budget denial from uncertain failure', async () => {
  mocks.shorten.mockRejectedValue(new LivCostPretransportError('liv_budget_exceeded'));
  const response = await POST(post()); expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: 'liv_shortening_budget_denied', publicationReady: false, providerAttempted: false });
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
