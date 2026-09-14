import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ access: vi.fn(), revise: vi.fn(), cancel: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access }));
vi.mock('@/lib/liv/cover-revision', async original => ({
  ...await original<typeof import('@/lib/liv/cover-revision')>(),
  reviseLivCover: mocks.revise, cancelLivCoverBeforePatch: mocks.cancel,
}));
import { POST, DELETE } from '@/app/api/liv/revisions/cover/route';
const input = { itemId: 'a'.repeat(24), dayKey: '2026-09-15', requestId: 'owner-cover-001',
  expectedCmsHash: 'b'.repeat(64), expectedPayloadHash: 'c'.repeat(64),
  reason: 'Et mere relevant pressebillede.', imageUrl: 'https://a24films.com/still.jpg',
  sourcePageUrl: 'https://a24films.com/films/example', alt: 'Et billede fra filmen.', caption: 'Pressebillede fra filmen.' };
const request = (body: unknown = input) => new NextRequest('https://example.test/api/liv/revisions/cover', {
  method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer fixture' },
});
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ uid: 'owner', owner: true }); });
it.each([POST, DELETE])('denies anonymous and colleague requests before all work', async handler => {
  for (const access of [null, { uid: 'casper', owner: false }, { uid: 'milo', owner: false }]) {
    mocks.access.mockResolvedValue(access);
    const response = await handler(request());
    expect(response.status).toBe(access ? 403 : 401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  }
  expect(mocks.revise).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
});
it('uses the existing revision with unchanged request identity', async () => {
  mocks.revise.mockResolvedValue({ status: 'cover_staged', publicationVerified: false });
  for (let i = 0; i < 2; i++) expect((await POST(request())).status).toBe(200);
  expect(mocks.revise).toHaveBeenNthCalledWith(1, input); expect(mocks.revise).toHaveBeenNthCalledWith(2, input);
});
it('cancels only through the durable service', async () => {
  mocks.cancel.mockResolvedValue({ status: 'cover_cancelled', requestId: input.requestId });
  expect((await DELETE(request())).status).toBe(200);
  expect(mocks.cancel).toHaveBeenCalledWith(input); expect(mocks.revise).not.toHaveBeenCalled();
});
it.each([{ ...input, credit: 'Invented credit' }, { ...input, content: 'New article' },
  { ...input, expectedCmsHash: '' }, { ...input, caption: 'x'.repeat(9000) }])('rejects invalid or expanded input', async value => {
  expect((await POST(request(value))).status).toBe(400);
  expect(mocks.revise).not.toHaveBeenCalled();
});
it('does not expose upstream errors', async () => {
  mocks.revise.mockRejectedValue(new Error('Secret upstream response'));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'liv_cover_failed', publicationVerified: false });
});
