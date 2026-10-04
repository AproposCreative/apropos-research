import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ access: vi.fn(), get: vi.fn(), confirm: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mock.access }));
vi.mock('@/lib/mcp/shortening', async original => ({ ...await original<any>(), getExternalShortening: mock.get, confirmExternalShortening: mock.confirm }));
import { GET, POST } from '@/app/oauth/shortening/route';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
const origin = 'https://ai.aproposmagazine.com', id = 'a'.repeat(64), candidateHash = 'b'.repeat(64);
const get = (query = `proposalId=${id}`) => GET(new Request(`${origin}/oauth/shortening?${query}`));
const post = (body: unknown = { proposalId: id, candidateHash, reviewedFactsAndMeaning: true }, source = origin) => POST(new Request(`${origin}/oauth/shortening`, {
  method: 'POST', headers: { origin: source, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
beforeEach(() => {
  vi.clearAllMocks(); mock.access.mockResolvedValue({ uid: 'frederik', owner: true });
  mock.get.mockResolvedValue({ status: 'awaiting_review' }); mock.confirm.mockResolvedValue({ status: 'shortening_review_recorded', cmsChanged: false });
});
it.each([null, { uid: 'casper', owner: false }, { uid: 'milo', owner: false }])('denies missing/non-owner access: %j', async access => {
  mock.access.mockResolvedValue(access); expect((await get()).status).toBe(403); expect((await post()).status).toBe(403);
  expect(mock.get).not.toHaveBeenCalled(); expect(mock.confirm).not.toHaveBeenCalled();
});
it('returns private/no-store status for the server-selected UID without confirming', async () => {
  const response = await get(); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mock.get).toHaveBeenCalledExactlyOnceWith('frederik', id); expect(mock.confirm).not.toHaveBeenCalled();
});
it.each([`proposalId=${id}&proposalId=${id}`, `proposalId=${id}&uid=casper`, 'proposalId=bad', ''])('rejects malformed or ambiguous status parameters: %s', async query => {
  expect((await get(query)).status).toBe(409); expect(mock.get).not.toHaveBeenCalled();
});
it('requires exact personal confirmation and cannot accept a caller-supplied actor', async () => {
  expect((await post()).status).toBe(200);
  expect(mock.confirm).toHaveBeenCalledExactlyOnceWith('frederik', { proposalId: id, candidateHash, reviewedFactsAndMeaning: true });
  mock.confirm.mockClear();
  for (const body of [{ proposalId: id, candidateHash }, { proposalId: id, candidateHash, reviewedFactsAndMeaning: false },
    { proposalId: id, candidateHash, reviewedFactsAndMeaning: true, actorUid: 'casper' }, { data: 'x'.repeat(2500) }]) expect((await post(body)).status).toBe(409);
  expect(mock.confirm).not.toHaveBeenCalled();
});
it.each(['https://evil.example', 'https://chatgpt.com', 'null', ''])('rejects cross-origin confirmation: %s', async source => {
  expect((await post(undefined, source)).status).toBe(409); expect(mock.confirm).not.toHaveBeenCalled();
});
it('forbids paid work in both routes and returns no private raw error', async () => {
  mock.get.mockImplementation(async () => { assertPaidAiAllowed(); }); mock.confirm.mockImplementation(async () => { assertPaidAiAllowed(); });
  expect((await get()).status).toBe(409); expect((await post()).status).toBe(409);
  mock.get.mockRejectedValue(Error('sk-private source contents')); mock.confirm.mockRejectedValue(Error('sk-private'));
  expect(await (await get()).text()).not.toContain('sk-private'); expect(await (await post()).text()).not.toContain('sk-private');
});
