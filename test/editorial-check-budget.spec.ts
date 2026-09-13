import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentLivCostContext, livCostHeaders, withLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const m = vi.hoisted(() => ({ create: vi.fn(), embedding: vi.fn(), verify: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.create } } }), models: { default: 'test' } }));
vi.mock('@/lib/embeddings', () => ({ getEmbedding: m.embedding, loadEmbeddingsRemoteOrLocal: async () => [], cosineSimilarity: () => 0 }));
vi.mock('@/lib/api/middleware-auth', () => ({ isApiRequestAuthorized: async () => true }));
vi.mock('@/lib/factcheck/verify-article', () => ({ verifyArticleSources: m.verify }));
vi.mock('@/lib/liv/editorial-assessment', () => ({ assessLivEditorialArticle: m.verify }));
import { POST as factcheck } from '@/app/api/factcheck/route';
import { POST as critic } from '@/app/api/critic/tov/route';
import { POST as moderation } from '@/app/api/moderation/check/route';
const cases = [
  { path: '/api/factcheck', stage: 'factcheck', run: factcheck, body: { articleText: 'En kulturartikel med tilstrækkelig tekst.', sourceUrls: ['https://museum.dk'] }, mock: m.verify, result: { complete: false } },
  { path: '/api/critic/tov', stage: 'tov', run: critic, body: { text: 'Artikeltekst', author: 'Other' }, mock: m.create, result: { choices: [{ message: { content: 'Tips' } }] } },
  { path: '/api/moderation/check', stage: 'moderation', run: moderation, body: { content: 'Artikeltekst' }, mock: m.embedding, result: [1, 0] },
];
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('AI_SHARED_COST_ENABLED', 'true'); vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret-at-least-32-characters'); });
afterEach(() => vi.unstubAllEnvs());
for (const c of cases) {
  const request = (headers = {}) => new NextRequest(`http://localhost${c.path}`, { method: 'POST', body: JSON.stringify(c.body), headers });
  it(`${c.stage}: manual request establishes Writer accounting`, async () => {
    c.mock.mockImplementation(async () => { expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: c.stage }); return c.result; });
    expect((await c.run(request())).status).toBe(200);
    expect(c.mock).toHaveBeenCalledTimes(1);
  });
  it(`${c.stage}: signed Liv ownership survives shared wrapper`, async () => {
    const headers = withLivCostContext({ runId: 'existing-run', stage: 'prepare' }, () => livCostHeaders(c.path));
    c.mock.mockImplementation(async () => { expect(currentLivCostContext()).toMatchObject({ runId: 'existing-run', stage: c.stage }); expect(currentLivCostContext()?.scope).toBeUndefined(); return c.result; });
    expect((await c.run(request({ ...headers, Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` }))).status).toBe(200);
  });
  it(`${c.stage}: branded denial returns uncached 503, never success or login error`, async () => {
    c.mock.mockRejectedValue(new Error('SDK wrapper', { cause: new LivCostPretransportError('liv_cost_limit') }));
    const response = await c.run(request());
    expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('SDK wrapper');
  });
  it(`${c.stage}: forged context cannot downgrade to manual`, async () => {
    expect((await c.run(request({ 'x-liv-cost-context': 'forged' }))).status).toBe(401);
    expect(c.mock).not.toHaveBeenCalled();
  });
  it(`${c.stage}: invalid accounting configuration fails before work`, async () => {
    vi.stubEnv('AI_SHARED_COST_ENABLED', 'typo');
    expect((await c.run(request())).status).toBe(503);
    expect(c.mock).not.toHaveBeenCalled();
  });
}
it('advisory extraction and check both disable retries and bound output', async () => {
  m.create.mockImplementation(async () => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'factcheck' });
    return { choices: [{ message: { content: '["En påstand"]' } }] };
  });
  const response = await factcheck(new NextRequest('http://localhost/api/factcheck', { method: 'POST', body: JSON.stringify({ articleText: 'En kulturartikel til faktatjek.' }) }));
  expect(response.status).toBe(200);
  expect((await response.json()).complete).toBe(false);
  expect(m.create).toHaveBeenCalledTimes(2);
  for (const [body, options] of m.create.mock.calls) {
    expect(body.max_completion_tokens).toBeLessThanOrEqual(2048);
    expect(options).toMatchObject({ maxRetries: 0, timeout: 45_000 });
    expect(options.signal).toBeDefined();
  }
});
