import { createHash } from 'node:crypto';
import { getResearch } from '@/lib/research/service';
import { evaluateResearchQuality } from '@/lib/research/qualityGate';
import type { ResearchResult } from '@/lib/research/types';
import { config } from '@/lib/config/env';

export const WRITER_RESEARCH_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 64;
export const WRITER_RESEARCH_MAX_IN_FLIGHT = 64;
const MAX_RESULT_CHARS = 128_000;
type ResearchOptions = NonNullable<Parameters<typeof getResearch>[1]>;

/**
 * /api/ai-chat is authenticated by proxy.ts. Partition by the exact credential,
 * never a caller-supplied user/draft ID. No credential means no shared reuse
 * (including the proxy's unauthenticated local-development allowance).
 * Only a digest is retained; token rotation deliberately produces a cache miss.
 */
export function writerResearchScope(headers: Headers): string | undefined {
  const authorization = headers.get('authorization') || '';
  const internal = headers.get('x-internal-api-secret')?.trim() || '';
  if (!internal && !/^Bearer\s+\S+$/i.test(authorization)) return undefined;
  return createHash('sha256').update(JSON.stringify([authorization, internal])).digest('hex');
}

/** Best-effort per-process cache: cold starts/other instances safely fetch again. */
export function createWriterResearchCache(
  research = getResearch,
  now: () => number = Date.now,
) {
  const entries = new Map<string, { expiresAt: number; result: ResearchResult }>();
  const inFlight = new Map<string, Promise<ResearchResult>>();
  return async (scope: string | undefined, query: string, options: ResearchOptions = {}): Promise<ResearchResult> => {
    if (!scope) return research(query, options);
    const time = now();
    for (const [key, entry] of entries) if (entry.expiresAt <= time) entries.delete(key);
    // Exact query only: do not normalize case or infer an edit's topic from
    // previous research. Provider/model changes also invalidate reuse.
    const key = createHash('sha256').update(JSON.stringify([
      scope, query, options,
      options.model ?? config.openai.researchModel,
      process.env.OPENAI_RESEARCH_MODEL, process.env.OPENAI_MODEL,
      process.env.RESEARCH_PROVIDER, process.env.RESEARCH_FALLBACK_PROVIDER,
      process.env.RESEARCH_TIMEOUT_MS,
    ])).digest('hex');
    const cached = entries.get(key);
    if (cached) return structuredClone(cached.result);
    const pending = inFlight.get(key);
    if (pending) return structuredClone(await pending);
    // Never evict active owners. At capacity, unrelated misses run uncached.
    // The research service already bounds the underlying provider duration.
    if (inFlight.size >= WRITER_RESEARCH_MAX_IN_FLIGHT) return research(query, options);
    // Schedule in the first caller's ALS context, and register before starting.
    // Waiters share evidence only; their budget/run ownership stays independent.
    const operation = Promise.resolve().then(async () => {
      const result = await research(query, options);
      if (evaluateResearchQuality(result).pass && JSON.stringify(result).length <= MAX_RESULT_CHARS) {
        while (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
        entries.set(key, { expiresAt: now() + WRITER_RESEARCH_TTL_MS, result: structuredClone(result) });
      }
      return result;
    });
    inFlight.set(key, operation);
    try {
      return structuredClone(await operation);
    } finally {
      inFlight.delete(key);
    }
  };
}

export const getWriterResearch = createWriterResearchCache();
