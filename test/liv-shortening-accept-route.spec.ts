import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ access: vi.fn(), accept: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access }));
vi.mock('@/lib/liv/accept-shortening', () => ({ acceptLivShortening: mocks.accept }));
import { POST } from '@/app/api/liv/revisions/shortening/accept/route';
const input = { itemId: 'a'.repeat(24), requestId: 'accept-test-01', expectedPayloadHash: 'b'.repeat(64), expectedCmsHash: 'c'.repeat(64),
  candidateHash: 'd'.repeat(64), targetWords: 500, reviewedFactsAndMeaning: true };
const request = (body: unknown = input, query = '') => new NextRequest(`https://example.test/api/liv/revisions/shortening/accept${query}`, { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ owner: true, uid: 'token-owner' }); });
it.each([null, { owner: false }])('denies unauthorized acceptance %j', async access => {
  mocks.access.mockResolvedValue(access); expect((await POST(request())).status).toBe(access ? 403 : 401); expect(mocks.accept).not.toHaveBeenCalled();
});
it.each([{ ...input, actorUid: 'spoofed' }, { ...input, content: '<p>Client HTML</p>' }, { ...input, reviewedFactsAndMeaning: false }])('rejects expanded or unacknowledged input', async value => {
  expect((await POST(request(value))).status).toBe(400); expect(mocks.accept).not.toHaveBeenCalled();
});
it('rejects query parameters and oversized requests', async () => {
  expect((await POST(request(input, '?force=true'))).status).toBe(400);
  expect((await POST(request('x'.repeat(2001)))).status).toBe(400);
  expect(mocks.accept).not.toHaveBeenCalled();
});
it('passes authenticated identity and returns a private draft receipt', async () => {
  mocks.accept.mockResolvedValue({ status: 'shortening_staged', publicationVerified: false });
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.accept).toHaveBeenCalledWith(input, 'token-owner');
  expect(await response.json()).toMatchObject({ publicationVerified: false });
});
it('sanitizes service errors', async () => {
  mocks.accept.mockRejectedValue(new Error('private provider detail'));
  const response = await POST(request()); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'liv_shortening_failed', publicationVerified: false });
});
