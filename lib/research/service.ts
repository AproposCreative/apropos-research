import { logger } from '@/lib/logger';
import type { ResearchProviderName, ResearchResult, ResearchFallbackReason, ResearchDebugMetadata } from './types';
import { evaluateResearchQuality } from './qualityGate';
import { createOpenAIResponsesProvider } from './providers/openaiResponsesProvider';
import { createLegacyWebSearchProvider } from './providers/legacyWebSearchProvider';

function boundedTimeout(value: unknown, fallback = 15000): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1000 ? Math.min(60000, Math.floor(n)) : fallback;
}

function buildProvider(name: ResearchProviderName, model?: string) {
  return name === 'openai_responses' ? createOpenAIResponsesProvider(model) : createLegacyWebSearchProvider();
}

/** Abort the actual transport as well as rejecting callers that ignore cancellation. */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('research_timeout'));
          controller.abort();
        }, ms);
      }),
      run(controller.signal),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getResearch(
  query: string,
  opts: { maxResults?: number; model?: string; timeoutMs?: number; allowFallback?: boolean } = {},
): Promise<ResearchResult> {
  const started = Date.now();
  const maxResults = Number.isFinite(opts.maxResults) ? Math.max(1, Math.min(20, Math.floor(opts.maxResults!))) : 3;
  const configuredTimeout = boundedTimeout(process.env.RESEARCH_TIMEOUT_MS);
  const timeoutMs = boundedTimeout(opts.timeoutMs, configuredTimeout);
  const primaryName: ResearchProviderName = process.env.RESEARCH_PROVIDER?.trim() === 'legacy_web_search'
    ? 'legacy_web_search' : 'openai_responses';
  const fallbackName = opts.allowFallback === false || process.env.RESEARCH_FALLBACK_PROVIDER?.trim() === 'none'
    ? null : 'legacy_web_search';
  const attempts: NonNullable<ResearchDebugMetadata['attempts']> = [];

  async function attempt(name: ResearchProviderName, budget: number, model?: string): Promise<ResearchResult> {
    const start = Date.now();
    try {
      const result = await withTimeout(signal => buildProvider(name, model).search({ query, maxResults, signal, timeoutMs: budget }), budget);
      const gate = evaluateResearchQuality(result);
      result.debug.gateScore = gate.score;
      result.debug.gateReasons = gate.reasons;
      attempts.push({ provider: name, latencyMs: Date.now() - start, outcome: gate.pass ? 'passed' : 'quality_gate', sourceCount: result.sources.length });
      return result;
    } catch (error) {
      const timeout = error instanceof Error && error.message === 'research_timeout';
      const status = (error as { status?: unknown } | null)?.status;
      attempts.push({ provider: name, latencyMs: Date.now() - start, outcome: timeout ? 'timeout' : 'exception', sourceCount: 0,
        ...(typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? { status } : {}) });
      return emptyResult(name, query);
    }
  }

  let result = await attempt(primaryName, timeoutMs, opts.model);
  const primaryOutcome = attempts[0].outcome;
  if (primaryOutcome !== 'passed' && fallbackName && fallbackName !== primaryName) {
    // The fallback has its own bounded budget; do not double Liv's longer primary allowance.
    const fallback = await attempt(fallbackName, Math.min(configuredTimeout, 15000));
    // Preserve useful primary evidence when the fallback is empty or weaker.
    if (attempts[1].outcome === 'passed' || fallback.debug.gateScore > result.debug.gateScore) result = fallback;
    result.debug.fallbackUsed = true;
    result.debug.fallbackReason = primaryOutcome as ResearchFallbackReason;
  }
  result.debug.attempts = attempts;
  result.debug.latencyMs = Date.now() - started;
  logger.info('Research completed', {
    'research.provider': result.debug.provider,
    'research.fallback_used': result.debug.fallbackUsed,
    'research.fallback_reason': result.debug.fallbackReason || null,
    'research.latency_ms': result.debug.latencyMs,
    'research.sources_count': result.sources.length,
    'research.gate_score': result.debug.gateScore,
    'research.context_length': result.contextText.length,
    'research.query_length': query.length,
    'research.attempts': attempts,
  });
  return result;
}

function emptyResult(provider: ResearchProviderName, query: string): ResearchResult {
  return { contextText: '', sources: [], debug: { provider, fallbackUsed: false, latencyMs: 0,
    query, rawResultCount: 0, gateScore: 0, gateReasons: ['empty_result'] } };
}
