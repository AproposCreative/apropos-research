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
  /** Safe attempt metadata: no queries, provider bodies or credentials. */
  attempts?: Array<{
    provider: ResearchProviderName;
    latencyMs: number;
    outcome: 'passed' | 'quality_gate' | 'timeout' | 'exception';
    sourceCount: number;
    status?: number;
  }>;
}

export interface ResearchResult {
  contextText: string;
  sources: ResearchSource[];
  debug: ResearchDebugMetadata;
}

export interface ResearchRequest {
  query: string;
  maxResults: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ResearchProviderClient {
  name: ResearchProviderName;
  search(request: ResearchRequest): Promise<ResearchResult>;
}
