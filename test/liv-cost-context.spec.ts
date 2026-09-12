import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { currentLivCostContext, livCostHeaders, LIV_COST_HEADER, withLivCostContext, withLivCostRequest, withLivCostStage } from '@/lib/liv/cost-context';
const secret = 'fixture-internal-secret-not-real-123456789';
const now = Date.parse('2026-09-12T10:00:00Z');
beforeEach(() => { vi.stubEnv('INTERNAL_API_SECRET', secret); vi.stubEnv('CRON_SECRET', 'fixture-cron-secret-not-real-123456789'); });
afterEach(() => vi.unstubAllEnvs());
const context = { runId: 'prepare-2026-09-13', stage: 'writing' };
it('keeps parallel manual and different Liv stages isolated', async () => {
  const result = await Promise.all([
    withLivCostContext(context, async () => { await Promise.resolve(); return currentLivCostContext(); }),
    withLivCostContext({ ...context, runId: 'second' }, async () => withLivCostStage('media', async () => { await Promise.resolve(); return currentLivCostContext(); })),
    Promise.resolve().then(() => currentLivCostContext()),
  ]);
  expect(result[0]).toMatchObject(context); expect(result[1]).toMatchObject({ runId: 'second', stage: 'media' });
  expect(result[2]).toBeUndefined(); expect(currentLivCostContext()).toBeUndefined(); expect(livCostHeaders('/api/factcheck')).toEqual({});
});
it('shares a persistence failure flag across nested stages and stops further calls', () => {
  withLivCostContext(context, () => {
    withLivCostStage('media', () => { currentLivCostContext()!.blocked = true; });
    expect(currentLivCostContext()?.blocked).toBe(true);
    expect(() => withLivCostStage('next', () => 1)).toThrow('blocked');
    expect(() => livCostHeaders('/api/factcheck')).toThrow('blocked');
  });
});
function signed() { return withLivCostContext(context, () => livCostHeaders('/api/factcheck', now)); }
function request(extra: Record<string, string> = {}, path = '/api/factcheck') {
  return { url: `https://example.test${path}`, headers: new Headers({ ...signed(), 'x-internal-api-secret': secret, ...extra }) };
}
it('re-establishes context only from a signed path-bound internal request; stage remains server-owned', () => {
  expect(withLivCostRequest(request(), 'factcheck', () => currentLivCostContext(), now)).toEqual({ runId: context.runId, stage: 'factcheck' });
  expect(withLivCostRequest({ url: 'http://localhost/api/factcheck', headers: new Headers() }, 'factcheck', () => currentLivCostContext())).toBeUndefined();
});
it('rejects forged, expired, future, replayed-to-another-path and non-internal cost contexts', () => {
  for (const req of [request({ 'x-internal-api-secret': '' }), request({ [LIV_COST_HEADER]: 'forged' }),
    request({}, '/api/critic/tov'), request({ [LIV_COST_HEADER]: `${signed()[LIV_COST_HEADER]}x` })]) {
    expect(() => withLivCostRequest(req, 'factcheck', () => { throw new Error('must-not-run'); }, now)).toThrow(/liv_cost_context/);
  }
  expect(() => withLivCostRequest(request(), 'factcheck', () => 1, now + 300_000)).toThrow('invalid');
  expect(() => withLivCostRequest(request(), 'factcheck', () => 1, now - 1)).toThrow('invalid');
});
it('requires a sufficiently strong existing signing secret without creating or exposing one', () => {
  vi.stubEnv('INTERNAL_API_SECRET', 'short');
  expect(signed).toThrow('secret_unavailable');
});
