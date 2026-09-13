import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentLivCostContext } from '@/lib/liv/cost-context';
const mocks = vi.hoisted(() => ({ auth: vi.fn(async () => true), research: vi.fn() }));
vi.mock('@/lib/api/middleware-auth', () => ({ isApiRequestAuthorized: mocks.auth }));
vi.mock('@/lib/research/service', () => ({ getResearch: mocks.research }));
import { POST } from '@/app/api/research-engine/route';
const request = (body: unknown = { topic: 'Kultur' }) => new NextRequest('https://example.invalid/api/research-engine', { method: 'POST', body: JSON.stringify(body) });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('makes one bounded source lookup, never invents expert opinions or facts', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  mocks.research.mockImplementation(async (_query, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'research-engine' });
    expect(options).toEqual({ maxResults: 3, timeoutMs: 45000, allowFallback: false });
    return { contextText: 'Kildebaseret research. '.repeat(20), sources: [1, 2].map(i => ({ url: `https://example.invalid/${i}`, title: 'Kilde', source: 'Test', snippet: 'Kildeuddrag. '.repeat(12) })) };
  });
  const result = await POST(request());
  expect(result.status).toBe(200);
  expect((await result.json()).data).toMatchObject({ verificationStatus: 'discovery_only', expertInsights: [], factualData: [], keyFindings: [], trends: [] });
  expect(mocks.research).toHaveBeenCalledTimes(1);
});
it('fails honestly when no usable sources exist', async () => {
  mocks.research.mockResolvedValue({ contextText: '', sources: [] });
  const result = await POST(request());
  expect(result.status).toBe(503);
  expect((await result.json()).complete).toBe(false);
});
it('blocks invalid accounting before research', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'TRUE');
  expect((await POST(request())).status).toBe(503);
  expect(mocks.research).not.toHaveBeenCalled();
});
it('blocks anonymous requests before research', async () => {
  mocks.auth.mockResolvedValueOnce(false);
  expect((await POST(request())).status).toBe(401);
  expect(mocks.research).not.toHaveBeenCalled();
});
it('rejects oversized topics without paid work', async () => {
  expect((await POST(request({ topic: 'x'.repeat(1001) }))).status).toBe(400);
  expect(mocks.research).not.toHaveBeenCalled();
});
it('reuses successful research only for the same authenticated credential and topic', async () => {
  mocks.research.mockResolvedValue({ contextText: 'Kildebaseret research. '.repeat(20),
    sources: [1, 2].map(i => ({ url: `https://example.invalid/${i}`, title: 'Kilde', source: 'Test', snippet: 'Kildeuddrag. '.repeat(12) })) });
  const authenticated = (token: string) => new NextRequest('https://example.invalid/api/research-engine', {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ topic: 'Unique cache fixture' }),
  });
  const responses = await Promise.all([POST(authenticated('fixture-a')), POST(authenticated('fixture-a'))]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  expect(mocks.research).toHaveBeenCalledTimes(1);
  expect((await POST(authenticated('fixture-a'))).status).toBe(200);
  expect(mocks.research).toHaveBeenCalledTimes(1);
  expect((await POST(authenticated('fixture-b'))).status).toBe(200);
  expect(mocks.research).toHaveBeenCalledTimes(2);
});
