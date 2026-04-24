import type { GateResult } from '@/lib/liv/daily-history-store';
import type { PickedTopic } from '@/lib/liv/pick-topic';

export type ResearchSource = {
  title?: string;
  source?: string;
  url?: string | null;
  snippet?: string;
};

export type ResearchConfidence = 'low' | 'medium' | 'high';

export type ResearchQaSummary = {
  verifiedResearchSourceCount: number;
  verifiedClaimsCount: number;
  researchConfidence: ResearchConfidence;
  lineupNamesUsed: string[];
  requiresLineupNames: boolean;
  canAutoPublish: boolean;
  blockers: string[];
};

export function extractLikelyNames(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  const re =
    /\b(?:[A-ZÆØÅ][A-Za-zÆØÅæøå0-9]+(?:\s*&\s*[A-ZÆØÅ][A-Za-zÆØÅæøå0-9]+)?(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå0-9]+){0,3})\b/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) {
    const name = (m[0] || '').trim();
    if (name.length < 3 || name.length > 60) continue;
    if (/^(Heartland|Festival|Program|Danmark|Juni|Nyheder|Billetter|Transport|Parkering)$/i.test(name)) continue;
    out.add(name);
    if (out.size >= 24) break;
  }
  return Array.from(out);
}

export function extractVerifiedClaimsCount(gates: GateResult[]): number {
  const fc = gates.find((g) => g.name === 'factcheck');
  const detail = fc?.detail || '';
  const m = detail.match(/(\d+)\s+påstande\s+tjekket/i);
  return m ? Number.parseInt(m[1], 10) : 0;
}

export function computeResearchConfidence(
  verifiedSourceCount: number,
  verifiedClaimsCount: number
): ResearchConfidence {
  if (verifiedSourceCount >= 3 && verifiedClaimsCount >= 4) return 'high';
  if (verifiedSourceCount >= 2 && verifiedClaimsCount >= 1) return 'medium';
  return 'low';
}

export function getVerifiedResearchSources(researchSources: ResearchSource[]): ResearchSource[] {
  return (researchSources || []).filter(
    (r) =>
      typeof r?.url === 'string' &&
      /^https?:\/\//i.test(r.url) &&
      (r.source || '').toLowerCase() !== 'ai guidance'
  );
}

export function isLineupTopic(input: {
  topicTitle?: string;
  topicHint?: string;
  directiveHint?: string;
  expandedDirective?: string;
}): boolean {
  const hay = [
    input.topicTitle || '',
    input.topicHint || '',
    input.directiveHint || '',
    input.expandedDirective || '',
  ]
    .join(' ')
    .toLowerCase();
  return /\b(lineup|headliner|festival|plakat|program)\b/.test(hay);
}

export function buildResearchQaSummary(input: {
  articleContent: string;
  topic: PickedTopic | null;
  researchSources: ResearchSource[];
  gates: GateResult[];
  topicHint?: string;
  directiveHint?: string;
  expandedDirective?: string;
  minVerifiedSources?: number;
  minLineupNames?: number;
}): ResearchQaSummary {
  const minVerifiedSources = input.minVerifiedSources ?? 2;
  const minLineupNames = input.minLineupNames ?? 2;
  const verifiedResearchSources = getVerifiedResearchSources(input.researchSources);
  const verifiedClaimsCount = extractVerifiedClaimsCount(input.gates || []);
  const researchConfidence = computeResearchConfidence(
    verifiedResearchSources.length,
    verifiedClaimsCount
  );

  const sourceTextForNames = [
    input.topic?.source?.title || '',
    input.topic?.source?.excerpt || '',
    ...(input.researchSources || []).map((r) => `${r.title || ''} ${r.snippet || ''}`.trim()),
  ]
    .join(' ')
    .slice(0, 7000);
  const candidateNames = extractLikelyNames(sourceTextForNames);
  const lineupNamesUsed = candidateNames
    .filter((name) => input.articleContent.toLowerCase().includes(name.toLowerCase()))
    .slice(0, 16);

  const requiresLineupNames = isLineupTopic({
    topicTitle: input.topic?.title,
    topicHint: input.topicHint,
    directiveHint: input.directiveHint,
    expandedDirective: input.expandedDirective,
  });

  const blockers: string[] = [];
  if (verifiedResearchSources.length < minVerifiedSources) {
    blockers.push(`For få verificerbare kilder (${verifiedResearchSources.length}/${minVerifiedSources})`);
  }
  if (requiresLineupNames && lineupNamesUsed.length < minLineupNames) {
    blockers.push(`For få konkrete lineup-navne i teksten (${lineupNamesUsed.length}/${minLineupNames})`);
  }

  return {
    verifiedResearchSourceCount: verifiedResearchSources.length,
    verifiedClaimsCount,
    researchConfidence,
    lineupNamesUsed,
    requiresLineupNames,
    canAutoPublish: blockers.length === 0,
    blockers,
  };
}
