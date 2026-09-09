import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ResearchResult, ResearchProviderName } from '@/lib/research/types';
const m = vi.hoisted(() => ({ primary: vi.fn(), fallback: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/research/providers/openaiResponsesProvider', () => ({ createOpenAIResponsesProvider: () => ({ search: m.primary }) }));
vi.mock('@/lib/research/providers/legacyWebSearchProvider', () => ({ createLegacyWebSearchProvider: () => ({ search: m.fallback }) }));
vi.mock('@/lib/logger', () => ({ logger: { info: m.info } }));
import { getResearch } from '@/lib/research/service';

function result(count = 2, provider: ResearchProviderName = 'openai_responses'): ResearchResult {
  return { contextText: count ? 'Research evidence. '.repeat(30) : '',
    sources: Array.from({ length: count }, (_, i) => ({ title: `Source ${i}`, url: `https://source${i}.example/article`, source: 'fixture', snippet: 'Evidence. '.repeat(20) })),
    debug: { provider, fallbackUsed: false, latencyMs: 1, query: 'private-query', rawResultCount: count, gateScore: 0, gateReasons: [] } };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  vi.stubEnv('RESEARCH_PROVIDER', 'openai_responses');
  vi.stubEnv('RESEARCH_FALLBACK_PROVIDER', 'legacy_web_search');
  vi.stubEnv('RESEARCH_TIMEOUT_MS', '15000');
  m.primary.mockResolvedValue(result()); m.fallback.mockResolvedValue(result(0, 'legacy_web_search'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('returns passing primary evidence without fallback and clears its timer', async () => {
  const data = await getResearch('private-query');
  expect(data.debug.gateScore).toBe(100);
  expect(data.debug.attempts?.[0].outcome).toBe('passed');
  expect(m.fallback).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(JSON.stringify(m.info.mock.calls)).not.toContain('private-query');
});
it('aborts the primary transport at the bounded deadline and records total latency', async () => {
  m.primary.mockImplementation(() => new Promise(() => {}));
  const pending = getResearch('fixture', { timeoutMs: 45000 });
  await vi.advanceTimersByTimeAsync(44999);
  expect(m.fallback).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const data = await pending;
  expect(m.primary.mock.calls[0][0].signal.aborted).toBe(true);
  expect(m.fallback.mock.calls[0][0].timeoutMs).toBe(15000);
  expect(data.debug).toMatchObject({ fallbackUsed: true, fallbackReason: 'timeout', latencyMs: 45000 });
  expect(data.debug.attempts?.map(a => a.outcome)).toEqual(['timeout', 'quality_gate']);
  expect(vi.getTimerCount()).toBe(0);
});
it('does not discard partial primary sources for an empty fallback', async () => {
  m.primary.mockResolvedValue(result(1));
  const data = await getResearch('fixture');
  expect(data.sources).toHaveLength(1);
  expect(data.debug).toMatchObject({ provider: 'openai_responses', fallbackUsed: true, fallbackReason: 'quality_gate', gateScore: 50 });
});
it('selects a passing fallback and logs HTTP status, never the thrown provider body', async () => {
  m.primary.mockRejectedValue(Object.assign(new Error('private-provider-body'), { status: 429 }));
  m.fallback.mockResolvedValue(result(2, 'legacy_web_search'));
  const data = await getResearch('fixture');
  expect(data.debug.provider).toBe('legacy_web_search');
  expect(data.debug.attempts?.[0]).toMatchObject({ status: 429, outcome: 'exception' });
  expect(JSON.stringify([data, m.info.mock.calls])).not.toContain('private-provider-body');
});
it('respects disabled fallback and distinguishes timeout from an empty search', async () => {
  vi.stubEnv('RESEARCH_FALLBACK_PROVIDER', 'none');
  m.primary.mockImplementation(() => new Promise(() => {}));
  const pending = getResearch('fixture');
  await vi.advanceTimersByTimeAsync(15000);
  const data = await pending;
  expect(data.debug.fallbackUsed).toBe(false);
  expect(data.debug.attempts?.[0].outcome).toBe('timeout');
  expect(m.fallback).not.toHaveBeenCalled();
});
it('bounds invalid budgets and result limits', async () => {
  vi.stubEnv('RESEARCH_TIMEOUT_MS', 'NaN');
  await getResearch('fixture', { timeoutMs: NaN, maxResults: Infinity });
  expect(m.primary.mock.calls[0][0]).toMatchObject({ timeoutMs: 15000, maxResults: 3 });
  await getResearch('fixture', { timeoutMs: 999999, maxResults: 100 });
  expect(m.primary.mock.calls[1][0]).toMatchObject({ timeoutMs: 60000, maxResults: 20 });
});
it('bounds and aborts the fallback too', async () => {
  m.primary.mockRejectedValue(new Error('failed'));
  m.fallback.mockImplementation(() => new Promise(() => {}));
  const pending = getResearch('fixture');
  await vi.advanceTimersByTimeAsync(15000);
  const data = await pending;
  expect(m.fallback.mock.calls[0][0].signal.aborted).toBe(true);
  expect(data.debug.attempts?.[1].outcome).toBe('timeout');
  expect(vi.getTimerCount()).toBe(0);
});
