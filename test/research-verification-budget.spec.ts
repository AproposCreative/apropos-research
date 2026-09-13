import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { currentLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const m = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.create } } }) }));
import { verifyContent } from '@/lib/research-verification-service';
const sources = { webSearch: [{ title: 'Kilde', content: 'Kildetekst', url: 'https://example.org', snippet: 'Kildetekst', source: 'Example' }] };
const completion = (body: unknown, reason = 'stop') => ({ choices: [{ finish_reason: reason, message: { content: JSON.stringify(body) } }] });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('AI_SHARED_COST_ENABLED', 'true'); });
afterEach(() => vi.unstubAllEnvs());
it('shares a run across both bounded checks', async () => {
  const runs: string[] = [];
  m.create.mockImplementation(async (_, options) => {
    const ctx = currentLivCostContext();
    expect(ctx).toMatchObject({ scope: 'writer', stage: 'research-verification' });
    runs.push(ctx!.runId); expect(options).toMatchObject({ maxRetries: 0, timeout: 45000 });
    return completion({ similarity: 0, factuality: 1 });
  });
  expect((await verifyContent('Original tekst', sources)).passed).toBe(true);
  expect(runs).toHaveLength(2); expect(new Set(runs).size).toBe(1);
});
it('stops after a pretransport denial instead of continuing paid work', async () => {
  const denied = new LivCostPretransportError('limit');
  m.create.mockRejectedValue(denied);
  await expect(verifyContent('Tekst', sources)).rejects.toBe(denied);
  expect(m.create).toHaveBeenCalledTimes(1);
});
it.each([{}, { similarity: -1, factuality: 2 }, { similarity: '0', factuality: '1' }])('cannot pass on invalid scores: %j', async body => {
  m.create.mockResolvedValue(completion(body));
  expect((await verifyContent('Tekst', sources)).passed).toBe(false);
});
it('rejects truncated JSON even when scores look valid', async () => {
  m.create.mockResolvedValue(completion({ similarity: 0, factuality: 1 }, 'length'));
  expect((await verifyContent('Tekst', sources)).passed).toBe(false);
});
it('does not spend or imply verification without sources', async () => {
  expect((await verifyContent('Tekst', { webSearch: [] })).passed).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
});
it('preserves an actual zero factuality score', async () => {
  m.create.mockResolvedValue(completion({ similarity: 0, factuality: 0 }));
  const result = await verifyContent('Tekst', sources);
  expect(result.factualityScore).toBe(0); expect(result.passed).toBe(false);
});
