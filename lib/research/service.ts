import { logger } from '@/lib/logger';
import type {
  ResearchProviderClient,
  ResearchProviderName,
  ResearchResult,
  ResearchFallbackReason,
} from './types';
import { evaluateResearchQuality } from './qualityGate';
import { createOpenAIResponsesProvider } from './providers/openaiResponsesProvider';
import { createLegacyWebSearchProvider } from './providers/legacyWebSearchProvider';

const TIMEOUT_MS = parseInt(process.env.RESEARCH_TIMEOUT_MS || '15000', 10);
const DEBUG_LOG = process.env.RESEARCH_DEBUG_LOG === 'true';

function getProviderName(): ResearchProviderName {
  const v = (process.env.RESEARCH_PROVIDER || 'openai_responses').trim();
  if (v === 'legacy_web_search') return 'legacy_web_search';
  return 'openai_responses';
}

function getFallbackProviderName(): ResearchProviderName | null {
  const v = (process.env.RESEARCH_FALLBACK_PROVIDER || 'legacy_web_search').trim();
  if (v === 'none') return null;
  if (v === 'legacy_web_search') return 'legacy_web_search';
  return 'legacy_web_search';
}

function buildProvider(name: ResearchProviderName): ResearchProviderClient {
  switch (name) {
    case 'openai_responses':
      return createOpenAIResponsesProvider();
    case 'legacy_web_search':
      return createLegacyWebSearchProvider();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`research_timeout_${ms}ms`)), ms);
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

export async function getResearch(
  query: string,
  opts: { maxResults?: number } = {},
): Promise<ResearchResult> {
  const maxResults = opts.maxResults ?? 3;
  const primaryName = getProviderName();
  const fallbackName = getFallbackProviderName();
  const primary = buildProvider(primaryName);

  let result: ResearchResult;
  let fallbackReason: ResearchFallbackReason | undefined;

  try {
    result = await withTimeout(
      primary.search({ query, maxResults }),
      TIMEOUT_MS,
    );

    const gate = evaluateResearchQuality(result);
    result.debug.gateScore = gate.score;
    result.debug.gateReasons = gate.reasons;

    if (!gate.pass && fallbackName && fallbackName !== primaryName) {
      fallbackReason = 'quality_gate';
      if (DEBUG_LOG) {
        logger.debug('Research quality gate failed, running fallback', {
          provider: primaryName,
          gateScore: gate.score,
          gateReasons: gate.reasons,
        });
      }
      result = await runFallback(fallbackName, query, maxResults, fallbackReason);
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.startsWith('research_timeout');
    fallbackReason = isTimeout ? 'timeout' : 'exception';

    if (DEBUG_LOG) {
      logger.debug('Research primary provider failed', {
        provider: primaryName,
        reason: fallbackReason,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (fallbackName && fallbackName !== primaryName) {
      result = await runFallback(fallbackName, query, maxResults, fallbackReason);
    } else {
      result = emptyResult(primaryName, query, fallbackReason);
    }
  }

  logResearch(result);
  return result;
}

async function runFallback(
  name: ResearchProviderName,
  query: string,
  maxResults: number,
  reason: ResearchFallbackReason,
): Promise<ResearchResult> {
  try {
    const provider = buildProvider(name);
    const result = await withTimeout(
      provider.search({ query, maxResults }),
      TIMEOUT_MS,
    );
    result.debug.fallbackUsed = true;
    result.debug.fallbackReason = reason;

    const gate = evaluateResearchQuality(result);
    result.debug.gateScore = gate.score;
    result.debug.gateReasons = gate.reasons;

    return result;
  } catch {
    return emptyResult(name, query, reason);
  }
}

function emptyResult(
  provider: ResearchProviderName,
  query: string,
  fallbackReason?: ResearchFallbackReason,
): ResearchResult {
  return {
    contextText: '',
    sources: [],
    debug: {
      provider,
      fallbackUsed: !!fallbackReason,
      fallbackReason,
      latencyMs: 0,
      query,
      rawResultCount: 0,
      gateScore: 0,
      gateReasons: ['empty_result'],
    },
  };
}

function logResearch(result: ResearchResult): void {
  logger.info('Research completed', {
    'research.provider': result.debug.provider,
    'research.fallback_used': result.debug.fallbackUsed,
    'research.fallback_reason': result.debug.fallbackReason || null,
    'research.latency_ms': result.debug.latencyMs,
    'research.sources_count': result.sources.length,
    'research.gate_score': result.debug.gateScore,
    'research.context_length': result.contextText.length,
    'research.query_length': result.debug.query.length,
  });
}
