import type { ResearchResult } from './types';

export interface ResearchSourcePolicy { preferred: string[]; excluded: string[] }

/** Build a prompt-only view. Never mutate or delete the user's saved work.
 * Old generated dossiers lack a trustworthy policy receipt, so do not certify
 * them as source evidence under a current exclusion policy.
 */
export function researchPromptContext(context: Record<string, unknown>, policy?: ResearchSourcePolicy): Record<string, unknown> {
  if (!policy?.excluded.length) return context;
  const { researchSelected: _selected, editorialResearch: _dossier, ...remaining } = context;
  return remaining;
}
export function sourcePolicy(rows: { baseUrl?: unknown; enabled?: unknown }[]): ResearchSourcePolicy {
  const preferred = new Set<string>(); const excluded = new Set<string>();
  for (const row of rows) {
    if (typeof row.baseUrl !== 'string' || typeof row.enabled !== 'boolean') continue;
    try {
      const url = new URL(row.baseUrl);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (url.protocol !== 'https:' || url.username || url.password || !/^[a-z0-9.-]+$/.test(host)) continue;
      (row.enabled ? preferred : excluded).add(host);
    } catch { /* Malformed saved values cannot become prompt instructions. */ }
  }
  const isExcluded = (host: string) => [...excluded].some(d => host === d || host.endsWith(`.${d}`));
  return { preferred: [...preferred].filter(d => !isExcluded(d)).sort(), excluded: [...excluded].sort() };
}

export function sourcePolicyQuery(query: string, policy?: ResearchSourcePolicy): string {
  if (!policy || (!policy.preferred.length && !policy.excluded.length)) return query;
  return `${query}\nSource preferences: prioritize ${policy.preferred.join(', ') || 'official primary sources'}; official primary sources remain allowed. Do not consult or cite these publishers or their subdomains: ${policy.excluded.join(', ') || 'none'}.`;
}

/** A mixed generated brief cannot be safely cleaned by hiding its citations. */
export function enforceSourcePolicy(result: ResearchResult, policy?: ResearchSourcePolicy): ResearchResult {
  if (!policy?.excluded.length) return result;
  const excluded = result.sources.some(source => {
    if (!source.url) return true;
    try {
      const host = new URL(source.url).hostname.toLowerCase().replace(/^www\./, '');
      return policy.excluded.some(d => host === d || host.endsWith(`.${d}`));
    } catch { return true; }
  });
  if (!excluded && result.sources.length) return result;
  return { ...result, contextText: '', sources: [], debug: { ...result.debug, gateScore: 0, gateReasons: ['source_policy_rejected'] } };
}
