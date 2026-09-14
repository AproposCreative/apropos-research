import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ access: vi.fn(), revise: vi.fn(), baseline: vi.fn(), cancel: vi.fn() }));
vi.mock('@/lib/liv/presentation-baseline', () => ({ readLivPresentationBaseline: mocks.baseline }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mocks.access }));
vi.mock('@/lib/liv/presentation-revision', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/liv/presentation-revision')>(),
  reviseLivPresentation: mocks.revise,
  cancelUnstartedLivPresentation: mocks.cancel,
}));
import { GET, POST, DELETE } from '@/app/api/liv/revisions/presentation/route';

const input = {
  itemId: 'a'.repeat(24), requestId: 'owner-revision-001',
  expectedCmsHash: 'b'.repeat(64), expectedPayloadHash: 'c'.repeat(64),
  reason: 'Gør anmeldelsens titel tydelig.',
  patch: { title: 'Anmeldelse: Klovn sæson 11', seoTitle: 'Anmeldelse af Klovn sæson 11',
    seoDescription: 'En anmeldelse af Klovn sæson 11 med en tydelig vurdering.' },
};
const request = (body: unknown = input, query = '') => new NextRequest(`https://example.test/api/liv/revisions/presentation${query}`, {
  method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer fixture' },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ uid: 'owner', owner: true });
  mocks.revise.mockResolvedValue({ status: 'staged', publicationVerified: false });
});
it.each([null, { uid: 'colleague', owner: false }])('protects baseline GET for %j', async access => {
  mocks.access.mockResolvedValue(access);
  expect((await GET(request(input, `?itemId=${input.itemId}`))).status).toBe(access ? 403 : 401);
  expect(mocks.baseline).not.toHaveBeenCalled();
});
it('reads an owner baseline with private cache control', async () => {
  mocks.baseline.mockResolvedValue({ itemId: input.itemId });
  const response = await GET(request(input, `?itemId=${input.itemId}`));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.baseline).toHaveBeenCalledWith(input.itemId);
});
it.each([null, { uid: 'colleague', owner: false }])('protects cancellation for %j', async access => {
  mocks.access.mockResolvedValue(access);
  expect((await DELETE(request())).status).toBe(access ? 403 : 401);
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it('passes owner cancellation through the existing journal without editing', async () => {
  mocks.cancel.mockResolvedValue({ status: 'presentation_cancelled', requestId: input.requestId });
  expect((await DELETE(request())).status).toBe(200);
  expect(mocks.cancel).toHaveBeenCalledWith(input);
  expect(mocks.revise).not.toHaveBeenCalled();
});
it.each(['', '?itemId=invalid', `?itemId=${input.itemId}&itemId=${input.itemId}`, `?itemId=${input.itemId}&uid=other`])('rejects ambiguous GET %s', async query => {
  expect((await GET(request(input, query))).status).toBe(400);
  expect(mocks.baseline).not.toHaveBeenCalled();
});
it.each([null, { uid: 'casper', owner: false }, { uid: 'milo', owner: false }])('denies unauthorized identity %j before any work', async access => {
  mocks.access.mockResolvedValue(access);
  const response = await POST(request());
  expect(response.status).toBe(access ? 403 : 401);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.revise).not.toHaveBeenCalled();
});
it('passes exact request identity and hashes to the existing journal on replay', async () => {
  for (let i = 0; i < 2; i++) {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ publicationVerified: false });
    expect(mocks.revise).toHaveBeenLastCalledWith(input);
  }
});
it.each([
  { ...input, uid: 'someone-else' },
  { ...input, restorePreparedIntro: true },
  { ...input, restorePreparedCaptions: true },
  { ...input, expectedCmsHash: '' },
  { ...input, patch: { ...input.patch, content: 'Changed article' } },
  { ...input, reason: 'x'.repeat(6001) },
])('rejects expanded or invalid operations before mutation', async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(mocks.revise).not.toHaveBeenCalled();
});
it('rejects query parameters', async () => {
  expect((await POST(request(input, '?publish=true'))).status).toBe(400);
  expect(mocks.revise).not.toHaveBeenCalled();
});
it.each([
  ['liv_presentation_conflict', 409, 'liv_presentation_conflict'],
  ['liv_presentation_store_unavailable', 503, 'liv_presentation_store_unavailable'],
  ['upstream secret content', 503, 'liv_presentation_failed'],
])('sanitizes errors: %s', async (message, status, code) => {
  mocks.revise.mockRejectedValue(new Error(message));
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: code, publicationVerified: false });
});
