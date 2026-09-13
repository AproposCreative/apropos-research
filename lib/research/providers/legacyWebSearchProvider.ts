import { internalApiHeaders } from '@/lib/api/internal-auth';
import { currentLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
import type {
  ResearchProviderClient,
  ResearchRequest,
  ResearchResult,
  ResearchSource,
} from '../types';

function formatContextText(sources: ResearchSource[]): string {
  return sources
    .map(s => `- ${s.title}: ${s.snippet.slice(0, 200)}`)
    .join('\n');
}

export function createLegacyWebSearchProvider(): ResearchProviderClient {
  return {
    name: 'legacy_web_search',

    async search(request: ResearchRequest): Promise<ResearchResult> {
      // This legacy endpoint does not propagate/settle shared provider costs.
      // Scoped jobs must not escape their budget through an internal HTTP hop.
      if (currentLivCostContext()) throw new LivCostPretransportError('research_legacy_unmetered');
      const t0 = Date.now();
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/web-search`, {
        method: 'POST',
        headers: internalApiHeaders(),
        body: JSON.stringify({ query: request.query, maxResults: request.maxResults }),
        signal: request.signal,
      });

      if (!res.ok) {
        throw Object.assign(new Error('research_legacy_http_error'), { status: res.status });
      }

      const data = await res.json();
      const raw: any[] = data?.data?.results || data?.results || [];
      if (!Array.isArray(raw) || raw.length === 0) {
        return emptyResult(request.query, Date.now() - t0);
      }

      const sources: ResearchSource[] = raw.slice(0, request.maxResults).map((r: any) => ({
        title: r.title || '',
        url: r.url || null,
        source: r.source || 'web',
        snippet: (r.content || r.extract || r.snippet || '').slice(0, 500),
      }));

      const contextText = formatContextText(sources);
      return {
        contextText,
        sources,
        debug: {
          provider: 'legacy_web_search',
          fallbackUsed: false,
          latencyMs: Date.now() - t0,
          query: request.query,
          rawResultCount: raw.length,
          gateScore: 0,
          gateReasons: [],
        },
      };
    },
  };
}

function emptyResult(query: string, latencyMs: number): ResearchResult {
  return {
    contextText: '',
    sources: [],
    debug: {
      provider: 'legacy_web_search',
      fallbackUsed: false,
      latencyMs,
      query,
      rawResultCount: 0,
      gateScore: 0,
      gateReasons: [],
    },
  };
}
