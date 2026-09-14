import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ auth: vi.fn(), summary: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mock.auth }));
vi.mock('@/lib/liv/cost-ledger', () => ({ readSharedCostSummary: mock.summary }));
import { GET } from '@/app/api/ai-cost/summary/route';
beforeEach(() => { vi.resetAllMocks(); mock.auth.mockResolvedValue(null); mock.summary.mockResolvedValue({ billedDkk: null });
  vi.stubEnv('CRON_SECRET', 'fixture-secret'); vi.stubEnv('INTERNAL_API_SECRET', 'fixture-internal'); });
afterEach(() => vi.unstubAllEnvs());
it('denies anonymous requests before reading the ledger even outside production', async () => {
  expect((await GET(new NextRequest('https://test/api/ai-cost/summary'))).status).toBe(401);
  expect(mock.summary).not.toHaveBeenCalled();
});
it.each([{ authorization: 'Bearer fixture-secret' }, { 'x-internal-api-secret': 'fixture-internal' }])('permits existing server credentials without caching aggregates', async headers => {
  const response = await GET(new NextRequest('https://test/api/ai-cost/summary', { headers }));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ billedDkk: null });
});
it('permits only the verified editorial owner in the UI', async () => {
  mock.auth.mockResolvedValue({ uid: 'fixture-owner', owner: true });
  expect((await GET(new NextRequest('https://test/api/ai-cost/summary', { headers: { authorization: 'Bearer fixture-token' } }))).status).toBe(200);
});
it.each(['casper', 'milo'])('denies colleague %s before ledger reads without relying on middleware', async uid => {
  mock.auth.mockResolvedValue({ uid, owner: false, role: 'admin' });
  const response = await GET(new NextRequest('https://test/api/ai-cost/summary', { headers: { authorization: 'Bearer fixture-token' } }));
  expect(response.status).toBe(403);
  expect(mock.summary).not.toHaveBeenCalled();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
