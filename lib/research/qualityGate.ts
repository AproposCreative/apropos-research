import type { ResearchResult, ResearchGateResult } from './types';

interface GateConfig {
  minSources: number;
  minContextChars: number;
  minSnippetLength: number;
  minSnippetsWithLength: number;
}

const DEFAULT_CONFIG: GateConfig = {
  minSources: parseInt(process.env.RESEARCH_MIN_SOURCES || '2', 10),
  minContextChars: parseInt(process.env.RESEARCH_MIN_CONTEXT_CHARS || '240', 10),
  minSnippetLength: 80,
  minSnippetsWithLength: 2,
};

export function evaluateResearchQuality(
  result: ResearchResult,
  overrides?: Partial<GateConfig>,
): ResearchGateResult {
  const cfg = { ...DEFAULT_CONFIG, ...overrides };
  const reasons: string[] = [];
  let score = 100;

  if (result.sources.length < cfg.minSources) {
    reasons.push(`too_few_sources: ${result.sources.length} < ${cfg.minSources}`);
    score -= 30;
  }

  if (result.contextText.length < cfg.minContextChars) {
    reasons.push(`context_too_short: ${result.contextText.length} < ${cfg.minContextChars}`);
    score -= 30;
  }

  const hasUrl = result.sources.some(s => !!s.url);
  if (!hasUrl) {
    reasons.push('no_source_urls');
    score -= 20;
  }

  const longSnippets = result.sources.filter(s => s.snippet.length >= cfg.minSnippetLength).length;
  if (longSnippets < cfg.minSnippetsWithLength) {
    reasons.push(`weak_snippets: ${longSnippets} >= ${cfg.minSnippetLength}ch, need ${cfg.minSnippetsWithLength}`);
    score -= 20;
  }

  score = Math.max(0, score);
  return { pass: reasons.length === 0, score, reasons };
}
