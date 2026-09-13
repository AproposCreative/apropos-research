import { afterEach, expect, it, vi } from 'vitest';
import { currentLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const research = vi.hoisted(() => vi.fn());
vi.mock('@/lib/research/service', () => ({ getResearch: research }));
import { performMultiStrategySearch } from '@/lib/editorial/search';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
it('uses one scoped search and skips extra network work when sufficient', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  const network = vi.fn(); vi.stubGlobal('fetch', network);
  research.mockImplementation(async (_, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'editorial-search' });
    expect(options.allowFallback).toBe(false);
    return { sources: [{ title: 'Kilde', snippet: 'Dokumentation', source: 'example', url: 'https://example.com/one' }] };
  });
  expect(await performMultiStrategySearch([{ query: 'one', strategy: 'exact' }, { query: 'two', strategy: 'broad' }], { maxResults: 1 })).toHaveLength(1);
  expect(research).toHaveBeenCalledTimes(1); expect(network).not.toHaveBeenCalled();
});
it('budget refusal does not start fallback network work', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  const network = vi.fn(); vi.stubGlobal('fetch', network);
  const error = new LivCostPretransportError('limit'); research.mockRejectedValue(error);
  await expect(performMultiStrategySearch([{ query: 'one', strategy: 'exact' }])).rejects.toBe(error);
  expect(network).not.toHaveBeenCalled();
});
