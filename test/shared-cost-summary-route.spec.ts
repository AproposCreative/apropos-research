import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ auth: vi.fn(), summary: vi.fn() }));
vi.mock('@/lib/billing/auth-request', () => ({ getFirebaseUidFromRequest: mock.auth }));
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
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ billedDkk: null });
});
it('permits Firebase-authenticated UI users and never exposes a policy mutation handler', async () => {
  mock.auth.mockResolvedValue({ uid: 'fixture-user' });
  expect((await GET(new NextRequest('https://test/api/ai-cost/summary', { headers: { authorization: 'Bearer fixture-token' } }))).status).toBe(200);
});
