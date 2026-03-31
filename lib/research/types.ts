export type ResearchProviderName = 'openai_responses' | 'legacy_web_search';
export type ResearchFallbackReason = 'exception' | 'timeout' | 'quality_gate';

export interface ResearchSource {
  title: string;
  url: string | null;
  source: string;
  snippet: string;
}

export interface ResearchGateResult {
  pass: boolean;
  score: number;
  reasons: string[];
}

export interface ResearchDebugMetadata {
  provider: ResearchProviderName;
  fallbackUsed: boolean;
  fallbackReason?: ResearchFallbackReason;
  latencyMs: number;
  query: string;
  rawResultCount: number;
  gateScore: number;
  gateReasons: string[];
}

export interface ResearchResult {
  contextText: string;
  sources: ResearchSource[];
  debug: ResearchDebugMetadata;
}

export interface ResearchRequest {
  query: string;
  maxResults: number;
}

export interface ResearchProviderClient {
  name: ResearchProviderName;
  search(request: ResearchRequest): Promise<ResearchResult>;
}
