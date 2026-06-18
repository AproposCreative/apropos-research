import { performMultiStrategySearch } from '@/lib/editorial/search';
import type { EditorialSource } from '@/lib/editorial/types';
import { FUNDING_CATEGORIES } from '@/lib/funding/categories';
import { buildEligibilityMatchSummary, computeFitScore } from '@/lib/funding/eligibility';
import { getApplicationSectionOption } from '@/lib/funding/application-sections';
import { dedupeKey, fundingSlug, normalizeFundingText } from '@/lib/funding/normalize';
import { mergeOpportunities, readStoredOpportunities } from '@/lib/funding/opportunity-store';
import { scoreFundingOpportunity } from '@/lib/funding/scoring';
import type {
  ApplicationBrief,
  ApplicationSection,
  CoveredFundingEntry,
  DeadlineStatus,
  DiscoverOpportunitiesOptions,
  FundingCategory,
  FundingDossier,
  FundingOpportunity,
  FundingQualityGate,
  FundingResearchResult,
} from '@/lib/funding/types';

function clamp(value: number, min = 15, max = 95) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sourceHost(source: EditorialSource): string {
  return (source.domain || source.source || 'web').toLowerCase();
}

function sourceSnippet(source: EditorialSource): string {
  return (source.content || source.title).replace(/\s+/g, ' ').slice(0, 280);
}

function cleanBriefText(input: string): string {
  return input
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSourceReference(source: EditorialSource, index: number): string {
  const title = cleanBriefText(source.title) || source.domain || `Kilde ${index + 1}`;
  const sourceName = cleanBriefText(source.source.replace(/^ChatGPT websearch:\s*/i, '')) || source.domain || 'web';
  const snippet = cleanBriefText(source.content || source.title);
  return [
    `${index + 1}. ${title}`,
    `   Kilde: ${sourceName}`,
    snippet ? `   Relevans: ${snippet}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function uniqueWords(input: string): string[] {
  const stop = new Set([
    'eller', 'ikke', 'som', 'med', 'for', 'til', 'fra', 'det', 'den', 'der', 'under', 'over', 'dansk', 'danmark',
    'ansogning', 'ansøgning', 'tilskud', 'pulje', 'fond',
  ]);
  return normalizeFundingText(input)
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stop.has(word))
    .slice(0, 12);
}

function duplicateRiskFor(text: string, covered: CoveredFundingEntry[] = []): number {
  const words = new Set(uniqueWords(text));
  if (words.size === 0) return 0;
  let overlap = 0;
  for (const entry of covered) {
    const coveredWords = uniqueWords([entry.title, entry.funder].filter(Boolean).join(' '));
    for (const word of coveredWords) {
      if (words.has(word)) overlap += 1;
    }
  }
  return Math.min(100, overlap * 14);
}

function inferFunder(title: string, snippet: string, category: FundingCategory): string {
  const text = `${title} ${snippet}`;
  const known = [
    'Statens Kunstfond',
    'Kulturministeriet',
    'Creative Europe',
    'Realdania',
    'Novo Nordisk Fonden',
    'Nordea-fonden',
    'Nordisk Film & TV Fond',
  ];
  for (const name of known) {
    if (text.toLowerCase().includes(name.toLowerCase())) return name;
  }
  return category.label;
}

function parseDeadline(text: string): { deadline?: string; status: DeadlineStatus } {
  const combined = text;
  const iso = combined.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const status: DeadlineStatus = Date.parse(d) < Date.now() ? 'closed' : 'open';
    return { deadline: d, status };
  }
  const dk = combined.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
  if (dk) {
    const d = `${dk[3]}-${dk[2].padStart(2, '0')}-${dk[1].padStart(2, '0')}`;
    const status: DeadlineStatus = Date.parse(d) < Date.now() ? 'closed' : 'open';
    return { deadline: d, status };
  }
  if (/frist|deadline|ansøgningsfrist|ansogningsfrist/i.test(combined)) {
    return { status: 'unknown' };
  }
  return { status: 'unknown' };
}

function extractAmountHint(text: string): string | undefined {
  const m = text.match(/(\d[\d.\s]*)\s*(kr\.?|dkk|eur|€|million)/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : undefined;
}

function isOfficialSource(source: EditorialSource): boolean {
  const host = sourceHost(source);
  return /\.gov\.dk$/.test(host) || /kunst\.dk|kum\.dk|kulturstyrelsen|eacea\.ec\.europa|nordiskfilmogtvfond/i.test(host);
}

function buildDiscoveryQueries(category: FundingCategory) {
  const year = new Date().getFullYear();
  const queries: { query: string; strategy: string }[] = [];
  for (const seed of category.searchSeeds) {
    queries.push({ query: `${seed} ansøgning deadline ${year}`, strategy: 'funding-deadline' });
    queries.push({ query: `${seed} tilskud kulturmedier`, strategy: 'funding-media' });
  }
  for (const hint of category.siteHints.slice(0, 2)) {
    queries.push({ query: `${hint} ${category.searchSeeds[0]} udbud`, strategy: 'funding-site' });
  }
  return queries;
}

function buildResearchQueries(opportunity: FundingOpportunity) {
  const keywords = uniqueWords([opportunity.title, opportunity.funder, opportunity.eligibilitySummary].join(' '))
    .slice(0, 8)
    .join(' ');
  return [
    { query: `${opportunity.funder} ${opportunity.title} ansøgning`, strategy: 'funding-exact' },
    { query: `${keywords} ansøgningsfrist vejledning`, strategy: 'funding-guide' },
    { query: `${opportunity.funder} hvem kan ansøge`, strategy: 'funding-eligibility' },
    { query: `${opportunity.category} tilskud danmark`, strategy: 'funding-context' },
  ];
}

function opportunityFromSource(
  category: FundingCategory,
  source: EditorialSource,
  index: number,
  covered: CoveredFundingEntry[]
): FundingOpportunity {
  const title = source.title.replace(/\s+-\s+.+$/, '').trim() || `${category.label}: funding-mulighed`;
  const snippet = sourceSnippet(source);
  const funder = inferFunder(title, snippet, category);
  const combined = `${title} ${snippet} ${source.content || ''}`;
  const { deadline, status: deadlineStatus } = parseDeadline(combined);
  const fitScore = computeFitScore(combined);
  const duplicateRisk = duplicateRiskFor(`${title} ${funder}`, covered);
  const urgency = clamp(80 - index * 5 + (deadlineStatus === 'open' ? 8 : 0) + (deadline ? 5 : 0));
  const risk = clamp(20 + (source.url ? 0 : 22) + (isOfficialSource(source) ? -8 : 12) + duplicateRisk / 5);

  const requirements: string[] = [];
  if (/budget|økonomi|finansiering/i.test(combined)) requirements.push('Budget / økonomisk oversigt');
  if (/projektbeskrivelse|projektplan|formål/i.test(combined)) requirements.push('Projektbeskrivelse');
  if (/cv|erfaring|organisation/i.test(combined)) requirements.push('Organisationsprofil / CV');

  return {
    id: `fund-${category.id}-${fundingSlug(`${funder}-${title}`)}`,
    title,
    funder,
    category: category.label,
    categoryId: category.id,
    amountHint: extractAmountHint(combined),
    currency: /eur|€/i.test(combined) ? 'EUR' : /dkk|kr/i.test(combined) ? 'DKK' : undefined,
    deadline,
    deadlineStatus,
    eligibilitySummary: snippet.slice(0, 320) || `Mulighed inden for ${category.label}. Verificér officielle vilkår.`,
    requirements: requirements.length ? requirements : ['Officielle ansøgningsmaterialer — se kilde'],
    fitScore,
    urgencyScore: urgency,
    riskScore: risk,
    duplicateRisk,
    sources: [source],
    nextAction: 'Kør research, vurder eligibility og opret ansøgningstracking.',
    discoveredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function discoverOpportunities(
  options: DiscoverOpportunitiesOptions = {}
): Promise<FundingOpportunity[]> {
  const limit = Math.max(3, Math.min(16, options.limit || 10));
  const covered: CoveredFundingEntry[] = (options.coveredIds || []).map((id) => {
    const stored = readStoredOpportunities().find((o) => o.id === id);
    return stored ? { opportunityId: id, title: stored.title, funder: stored.funder } : { opportunityId: id };
  });

  const batches = await Promise.all(
    FUNDING_CATEGORIES.map(async (category) => {
      const sources = await performMultiStrategySearch(buildDiscoveryQueries(category), { maxResults: 5 });
      return sources
        .slice(0, 2)
        .map((source, index) => opportunityFromSource(category, source, index, covered))
        .filter((o) => o.deadlineStatus !== 'closed');
    })
  );

  const discovered = batches
    .flat()
    .sort((a, b) => scoreFundingOpportunity(b) - scoreFundingOpportunity(a))
    .slice(0, limit);

  if (options.mergeStored !== false) {
    const { merged } = mergeOpportunities(discovered);
    return merged.slice(0, limit);
  }
  return discovered;
}

function buildKeyFacts(opportunity: FundingOpportunity, sources: EditorialSource[]): string[] {
  return [
    opportunity.eligibilitySummary,
    ...opportunity.requirements.map((r) => `Krav: ${r}`),
    ...sources.map((s) => `${s.title}: ${sourceSnippet(s)}`),
  ]
    .map(cleanBriefText)
    .filter(Boolean)
    .slice(0, 10);
}

export function buildFundingQualityGate(dossier: FundingDossier): FundingQualityGate {
  const domains = new Set(dossier.sources.map((s) => s.domain || s.source).filter(Boolean));
  const text = normalizeFundingText(
    [dossier.opportunity.title, dossier.opportunity.funder, dossier.eligibilityMatch, dossier.keyFacts.join(' ')].join(' ')
  );
  const sourceCount = dossier.sources.length;
  const sourceDiversity = domains.size;
  const officialOk = dossier.sources.some(isOfficialSource);
  const deadlineOk = /frist|deadline|20\d{2}/.test(text) || Boolean(dossier.opportunity.deadline);
  const eligibilityOk = /ansog|ansøg|kan søge|berettig|eligible|ansøger/i.test(text);
  const fitOk = dossier.opportunity.fitScore >= 55;

  const checks = [
    { id: 'official', label: 'Officiel kilde', ok: officialOk, detail: officialOk ? 'Mindst én troværdig kilde' : 'Mangler .gov.dk/funder-domæne' },
    { id: 'deadline', label: 'Frist angivet', ok: deadlineOk, detail: dossier.opportunity.deadline || 'Frist ikke fundet i kilder' },
    { id: 'eligibility', label: 'Eligibility tydelig', ok: eligibilityOk, detail: eligibilityOk ? 'Ansøgningskriterier nævnt' : 'Kræver manuel læsning' },
    { id: 'sources', label: 'Mindst 3 kilder', ok: sourceCount >= 3, detail: `${sourceCount} kilder` },
    { id: 'diversity', label: 'Kildediversitet', ok: sourceDiversity >= 2, detail: `${sourceDiversity} domæner` },
    { id: 'fit', label: 'Apropos-fit', ok: fitOk, detail: `Fit-score ${dossier.opportunity.fitScore}` },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  return { ready: score >= 70, score, sourceCount, sourceDiversity, checks };
}

export async function researchOpportunity(opportunity: FundingOpportunity): Promise<FundingDossier> {
  const sources = await performMultiStrategySearch(buildResearchQueries(opportunity), { maxResults: 8 });
  const merged = [...(opportunity.sources || []), ...sources];
  const deduped = Array.from(
    new Map(merged.map((s) => [`${(s.url || s.title).toLowerCase()}`, s])).values()
  ).slice(0, 8);

  const combined = [opportunity.title, opportunity.funder, ...deduped.map(sourceSnippet)].join(' ');
  const { match, gaps } = buildEligibilityMatchSummary(combined);

  const requiredDocuments = [...opportunity.requirements];
  if (!requiredDocuments.length) requiredDocuments.push('Officiel ansøgningsformular (hent fra funder)');

  return {
    opportunity: { ...opportunity, sources: deduped },
    sources: deduped,
    keyFacts: buildKeyFacts(opportunity, deduped),
    unansweredQuestions: [
      'Er Apropos eksplicit omfattet af målgruppen i de officielle vilkår?',
      'Kræves medfinansiering eller igangværende drift?',
      'Hvilke bilag skal vedlægges ved endelig indsendelse?',
    ],
    eligibilityMatch: match,
    eligibilityGaps: gaps,
    narrativeAngle:
      'Apropos som uafhængigt digitalt kulturmagasin der styrker kritisk, tilgængelig journalistik om musik, film/TV, gaming og bred kultur — med fokus på dansk/nordisk kontekst.',
    requiredDocuments,
  };
}

export function buildApplicationBrief(
  dossier: FundingDossier,
  qualityGate: FundingQualityGate,
  applicationSection: ApplicationSection = 'full'
): ApplicationBrief {
  const section = getApplicationSectionOption(applicationSection);
  const sourceLines = dossier.sources.slice(0, 8).map(formatSourceReference).join('\n');
  const factLines = dossier.keyFacts.map((f) => `- ${f}`).join('\n');
  const gapLines = dossier.eligibilityGaps.map((g) => `- ${g}`).join('\n');
  const docLines = dossier.requiredDocuments.map((d) => `- ${d}`).join('\n');
  const questionLines = dossier.unansweredQuestions.map((q) => `- ${q}`).join('\n');

  const text = [
    `Funding-brief: ${dossier.opportunity.title}`,
    '',
    `Funder: ${dossier.opportunity.funder}`,
    `Kategori: ${dossier.opportunity.category}`,
    `Ansøgningssektion: ${section.label} — ${section.description}`,
    dossier.opportunity.deadline ? `Deadline: ${dossier.opportunity.deadline} (${dossier.opportunity.deadlineStatus})` : 'Deadline: ikke verificeret i kilder',
    dossier.opportunity.amountHint ? `Beløb (hint): ${dossier.opportunity.amountHint}` : '',
    `Quality gate: ${qualityGate.ready ? 'Klar' : 'Kræver opmærksomhed'} (${qualityGate.score}/100)`,
    '',
    'Eligibility vs. Apropos:',
    dossier.eligibilityMatch,
    '',
    'Gaps:',
    gapLines || '- Ingen åbenlyse gaps noteret',
    '',
    'Foreslået narrativ vinkel:',
    dossier.narrativeAngle,
    '',
    'Krævede dokumenter:',
    docLines,
    '',
    'Kilder:',
    sourceLines || '- Ingen sikre kilder',
    '',
    'Key facts:',
    factLines,
    '',
    'Ubesvarede spørgsmål:',
    questionLines,
    '',
    `Skriv ansøgningstekst til sektionen "${section.label}". Det er IKKE en artikel. Brug kun verificerede facts fra kilderne. Opfind ikke beløb eller deadlines.`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    opportunityId: dossier.opportunity.id,
    opportunityTitle: dossier.opportunity.title,
    applicationSection: section.id,
    text,
  };
}

export async function runFundingResearch(
  opportunity: FundingOpportunity,
  options: { applicationSection?: ApplicationSection } = {}
): Promise<FundingResearchResult> {
  const dossier = await researchOpportunity(opportunity);
  const qualityGate = buildFundingQualityGate(dossier);
  const brief = buildApplicationBrief(dossier, qualityGate, options.applicationSection || 'full');
  return { dossier, qualityGate, brief };
}
