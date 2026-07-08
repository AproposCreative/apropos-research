import {
  EDITORIAL_ARTICLE_TYPE_OPTIONS,
  getEditorialArticleTypeOption,
  normalizeEditorialText,
  type CoveredEditorialTopic,
  type EditorialArticleType,
} from '@/lib/editorial/signal-store';
import { performMultiStrategySearch } from '@/lib/editorial/search';
import type {
  ArticleBrief,
  DiscoverSignalsOptions,
  EditorialBeat,
  EditorialResearchResult,
  EditorialSignal,
  EditorialSource,
  QualityGate,
  ResearchDossier,
} from '@/lib/editorial/types';

export const EDITORIAL_BEATS: EditorialBeat[] = [
  {
    id: 'musik',
    label: 'Musik',
    searchSeeds: ['musik', 'koncert', 'festival', 'album'],
    audience: 'Musiklæsere der vil forstå tendenserne bag udgivelser, festivaler og livekultur.',
  },
  {
    id: 'film-tv',
    label: 'Film & TV',
    searchSeeds: ['streaming', 'film serie', 'dokumentar', 'tv-serie'],
    audience: 'Streamere og seriepublikum der leder efter kontekst, anbefalinger og skarpere vinkler.',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    searchSeeds: ['gaming', 'spil', 'game preservation', 'spilbranchen'],
    audience: 'Gaminglæsere der ser spil som kultur, teknologi og fællesskab.',
  },
  {
    id: 'kultur',
    label: 'Kultur',
    searchSeeds: ['kultur', 'kunst', 'frivillige festival', 'kulturpolitik'],
    audience: 'Kulturinteresserede læsere der vil have et perspektiv før emnet bliver gammelt.',
  },
];

function clamp(value: number, min = 20, max = 95) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function slug(input: string) {
  return normalizeEditorialText(input).replace(/\s+/g, '-').slice(0, 80) || `signal-${Date.now().toString(36)}`;
}

function sourceHost(source: EditorialSource): string {
  return source.domain || source.source || 'web';
}

function sourceSnippet(source: EditorialSource): string {
  return (source.content || source.title).replace(/\s+/g, ' ').slice(0, 220);
}

function cleanBriefText(input: string): string {
  return input
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/\(\[([^\]]+)\]\(?/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/##\s*Hvad jeg ikke fandt[\s\S]*$/i, '')
    .replace(/Primær kilde:\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSourceReference(source: EditorialSource, index: number): string {
  const title = cleanBriefText(source.title) || source.domain || source.source || `Kilde ${index + 1}`;
  const sourceName = cleanBriefText(source.source.replace(/^ChatGPT websearch:\s*/i, '')) || source.domain || 'web';
  const snippet = cleanBriefText(source.content || source.title);
  return [
    `${index + 1}. ${title}`,
    `   Kilde: ${sourceName}`,
    snippet ? `   Relevans: ${snippet}` : '',
  ].filter(Boolean).join('\n');
}

function uniqueWords(input: string): string[] {
  const stop = new Set(['eller', 'ikke', 'som', 'med', 'for', 'til', 'fra', 'det', 'den', 'der', 'under', 'over', 'dansk', 'danmark']);
  return normalizeEditorialText(input)
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stop.has(word))
    .slice(0, 12);
}

function duplicateRiskFor(text: string, coveredTopics: CoveredEditorialTopic[] = []): number {
  const words = new Set(uniqueWords(text));
  if (words.size === 0) return 0;
  let overlap = 0;
  for (const topic of coveredTopics) {
    const coveredWords = uniqueWords([topic.signalTitle, topic.title, topic.topic, topic.slug].filter(Boolean).join(' '));
    for (const word of coveredWords) {
      if (words.has(word)) overlap += 1;
    }
  }
  return Math.min(100, overlap * 12);
}

function inferArticleType(signal: EditorialSignal, sources: EditorialSource[]): EditorialArticleType {
  const text = normalizeEditorialText([signal.title, signal.angle, signal.nextAction, sources.map((s) => s.title).join(' ')].join(' '));
  if (/anmeld|review|premiere|album|film|serie|spil/.test(text)) return 'review';
  if (/analyse|pris|økonomi|branche|rettighed|platform|streaming/.test(text)) return 'analysis';
  if (/kommentar|essay|debat|holdning/.test(text)) return 'commentary';
  if (/longread|portræt|interview|baggrund/.test(text)) return 'longread';
  if (/nyhed|lancer|annoncer|åbner|lukker/.test(text)) return 'short-news';
  return 'feature';
}

function signalFromSource(beat: EditorialBeat, source: EditorialSource, index: number, coveredTopics: CoveredEditorialTopic[]): EditorialSignal {
  const title = source.title.replace(/\s+-\s+.+$/, '').trim() || `${beat.label}: redaktionelt signal`;
  const snippet = sourceSnippet(source);
  const duplicateRisk = duplicateRiskFor(`${title} ${snippet} ${beat.label}`, coveredTopics);
  const urgency = clamp(84 - index * 4 + (source.source.includes('News') ? 5 : 0));
  const originality = clamp(70 + Math.min(12, Math.floor(snippet.length / 35)) - duplicateRisk / 10);
  const brandFit = clamp(78 + (/(kultur|musik|film|spil|serie|festival|streaming|kunst)/i.test(`${title} ${snippet}`) ? 10 : 0));
  const risk = clamp(24 + (source.url ? 0 : 18) + duplicateRisk / 4, 15, 75);
  const signal: EditorialSignal = {
    id: `dynamic-${beat.id}-${slug(title)}`,
    title,
    source: `Websignal: ${sourceHost(source)}`,
    beat: beat.label,
    urgency,
    originality,
    brandFit,
    risk,
    audience: beat.audience,
    angle: `Undersøg hvad signalet siger om ${beat.label.toLowerCase()} lige nu, og omsæt det til en Apropos-vinkel med dansk relevans.`,
    evidence: [
      snippet || `Aktuelt websignal inden for ${beat.label}.`,
      source.url ? `Primær kilde: ${source.url}` : `Kilde: ${source.source}`,
      'Kræver kildekritik, modvinkel og konkret dansk relevans før udgivelse.',
    ],
    nextAction: 'Research signalet, vurder kildekvalitet, find modvinkel og byg artikelbrief.',
    sources: [source],
    duplicateRisk,
  };
  return {
    ...signal,
    suggestedArticleType: inferArticleType(signal, [source]),
  };
}

function buildDiscoveryQueries(beat: EditorialBeat) {
  return beat.searchSeeds.flatMap((seed) => [
    { query: seed, strategy: 'beat-exact' },
    { query: `${seed} nyheder`, strategy: 'beat-news' },
  ]);
}

function buildResearchQueries(signal: EditorialSignal) {
  const keywords = uniqueWords([signal.title, signal.angle, signal.evidence.join(' ')].join(' ')).slice(0, 8).join(' ');
  return [
    { query: `${signal.title} ${signal.beat}`, strategy: 'exact-signal' },
    { query: `${keywords} ${signal.beat} danmark`, strategy: 'keyword-danish' },
    { query: `${signal.beat} kultur debat danmark ${keywords}`, strategy: 'beat-context' },
    { query: `${signal.beat} nyheder analyse`, strategy: 'source-diversity' },
  ];
}

export function scoreSignal(signal: EditorialSignal): number {
  return Math.round(signal.urgency * 0.25 + signal.originality * 0.3 + signal.brandFit * 0.35 - signal.risk * 0.1 - (signal.duplicateRisk || 0) * 0.15);
}

export async function discoverSignals(options: DiscoverSignalsOptions = {}): Promise<EditorialSignal[]> {
  const limit = Math.max(3, Math.min(12, options.limit || 8));
  const batches = await Promise.all(
    EDITORIAL_BEATS.map(async (beat) => {
      const sources = await performMultiStrategySearch(buildDiscoveryQueries(beat), { maxResults: 5 });
      return sources.slice(0, 2).map((source, index) => signalFromSource(beat, source, index, options.coveredTopics || []));
    })
  );
  return batches
    .flat()
    .sort((a, b) => scoreSignal(b) - scoreSignal(a))
    .slice(0, limit);
}

function buildKeyFacts(signal: EditorialSignal, sources: EditorialSource[]): string[] {
  const facts = [
    ...signal.evidence,
    ...sources.map((source) => `${source.title}: ${sourceSnippet(source)}`),
  ];
  return facts
    .map(cleanBriefText)
    .filter((fact) => fact && !/^kilde:?$/i.test(fact))
    .slice(0, 8);
}

function buildQualityGate(dossier: ResearchDossier, coveredTopics: CoveredEditorialTopic[] = []): QualityGate {
  const domains = new Set(dossier.sources.map((source) => source.domain || source.source).filter(Boolean));
  const text = normalizeEditorialText([
    dossier.signal.title,
    dossier.signal.angle,
    dossier.danishAngle,
    dossier.keyFacts.join(' '),
  ].join(' '));
  const sourceCount = dossier.sources.length;
  const sourceDiversity = domains.size;
  const duplicateRisk = duplicateRiskFor(text, coveredTopics);
  const claimRiskOk = sourceCount >= 3 && dossier.sources.some((source) => (source.score || 0) >= 65);
  const checks = [
    { id: 'source-count', label: 'Mindst 3 kilder', ok: sourceCount >= 3, detail: `${sourceCount} kilder fundet` },
    { id: 'source-diversity', label: 'Kildediversitet', ok: sourceDiversity >= 2, detail: `${sourceDiversity} kilde-domæner` },
    { id: 'danish-angle', label: 'Dansk vinkel', ok: /danmark|dansk|danske|københavn|aarhus|festival|kultur/.test(text), detail: dossier.danishAngle },
    { id: 'claim-risk', label: 'Lav claim-risiko', ok: claimRiskOk, detail: claimRiskOk ? 'Underbygget med kilder' : 'Kræver ekstra faktatjek' },
    { id: 'duplicate-risk', label: 'Lav overlap-risiko', ok: duplicateRisk < 40, detail: `Overlap-score ${duplicateRisk}` },
  ];
  const score = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100);
  return {
    ready: score >= 70,
    score,
    sourceCount,
    sourceDiversity,
    checks,
  };
}

export async function researchSignal(
  signal: EditorialSignal,
  options: { coveredTopics?: CoveredEditorialTopic[] } = {}
): Promise<ResearchDossier> {
  const sources = await performMultiStrategySearch(buildResearchQueries(signal), { maxResults: 8 });
  const mergedSources = [...(signal.sources || []), ...sources];
  const dedupedSources = Array.from(
    new Map(mergedSources.map((source) => [`${source.url || source.title}`.toLowerCase(), source])).values()
  ).slice(0, 8);
  const suggestedArticleType = signal.suggestedArticleType || inferArticleType(signal, dedupedSources);
  return {
    signal: {
      ...signal,
      suggestedArticleType,
    },
    sources: dedupedSources,
    keyFacts: buildKeyFacts(signal, dedupedSources),
    unansweredQuestions: [
      'Hvilke konkrete cases eller stemmer kan gøre vinklen menneskelig?',
      'Er der en modvinkel, der udfordrer den første tese?',
      'Hvilke fakta skal verificeres før publicering?',
    ],
    danishAngle: `Gør vinklen relevant for danske Apropos-læsere: lokale cases, dansk kulturøkonomi, danske platforme eller dansk publikumsadfærd.`,
    counterpoint: 'Undgå at gøre signalet større end kilderne bærer. Find mindst én modvinkel eller begrænsning.',
    suggestedArticleType,
  };
}

export function buildArticleBrief(dossier: ResearchDossier, qualityGate: QualityGate): ArticleBrief {
  const articleTypeOption = getEditorialArticleTypeOption(dossier.suggestedArticleType);
  const sourceLines = dossier.sources
    .slice(0, 8)
    .map(formatSourceReference)
    .join('\n');
  const factLines = dossier.keyFacts.map((fact) => `- ${fact}`).join('\n');
  const questionLines = dossier.unansweredQuestions.map((question) => `- ${question}`).join('\n');
  const text = [
    `Redaktionel brief: ${dossier.signal.title}`,
    '',
    `Beat: ${dossier.signal.beat}`,
    `Artikeltype: ${articleTypeOption.label} (${articleTypeOption.targetLengthLabel})`,
    `Målgruppe: ${dossier.signal.audience}`,
    `Vinkel: ${dossier.signal.angle}`,
    `Dansk relevans: ${dossier.danishAngle}`,
    `Modvinkel: ${dossier.counterpoint}`,
    `Quality gate: ${qualityGate.ready ? 'Klar' : 'Kræver redaktionel opmærksomhed'} (${qualityGate.score}/100)`,
    '',
    'Kilder:',
    sourceLines || '- Ingen sikre kilder fundet. Behandl som idé, ikke artikelklar brief.',
    '',
    'Key facts og kildepunkter:',
    factLines,
    '',
    'Åbne spørgsmål før publicering:',
    questionLines,
    '',
    'Skriv et originalt, verificerbart Apropos-udkast. Brug kilderne som kontekst og parafrasér altid.',
  ].filter(Boolean).join('\n');
  return {
    signalId: dossier.signal.id,
    signalTitle: dossier.signal.title,
    articleType: articleTypeOption.id,
    targetWordCount: articleTypeOption.targetWordCount,
    targetLengthLabel: articleTypeOption.targetLengthLabel,
    text,
  };
}

export async function runEditorialResearch(
  signal: EditorialSignal,
  options: { coveredTopics?: CoveredEditorialTopic[] } = {}
): Promise<EditorialResearchResult> {
  const dossier = await researchSignal(signal, options);
  const qualityGate = buildQualityGate(dossier, options.coveredTopics || []);
  const brief = buildArticleBrief(dossier, qualityGate);
  return { dossier, qualityGate, brief };
}

