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
      const t0 = Date.now();
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: request.query, maxResults: request.maxResults }),
      });

      if (!res.ok) {
        return emptyResult(request.query, Date.now() - t0);
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
