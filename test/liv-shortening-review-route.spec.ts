import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ access: vi.fn(), record: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access }));
vi.mock('@/lib/liv/shortening-review', async original => ({ ...await original<typeof import('@/lib/liv/shortening-review')>(), recordLivShorteningReview: mocks.record }));
import { POST } from '@/app/api/liv/revisions/shortening/review/route';
const input = { itemId: 'a'.repeat(24), requestId: 'review-test-01', expectedPayloadHash: 'b'.repeat(64), expectedCmsHash: 'c'.repeat(64),
  candidateHash: 'd'.repeat(64), targetWords: 500, reviewedFactsAndMeaning: true };
const request = (body: unknown = input) => new NextRequest('https://example.test/api/liv/revisions/shortening/review', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ owner: true, uid: 'token-owner' }); });
it.each([null, { owner: false }])('denies unauthorized review %j', async access => {
  mocks.access.mockResolvedValue(access); expect((await POST(request())).status).toBe(access ? 403 : 401); expect(mocks.record).not.toHaveBeenCalled();
});
it.each([{ ...input, actorUid: 'spoofed' }, { ...input, reviewedFactsAndMeaning: false }, { ...input, candidateHash: 'bad' }])('rejects expanded or unacknowledged input', async value => {
  expect((await POST(request(value))).status).toBe(400); expect(mocks.record).not.toHaveBeenCalled();
});
it('uses token identity and explicitly does not claim CMS publication', async () => {
  mocks.record.mockResolvedValue({ status: 'shortening_review_recorded', cmsChanged: false, publicationReady: false });
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.record).toHaveBeenCalledWith(input, 'token-owner');
});
it('sanitizes unexpected service failures', async () => {
  mocks.record.mockRejectedValue(new Error('private error'));
  const response = await POST(request()); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'liv_shortening_failed', publicationReady: false });
});
