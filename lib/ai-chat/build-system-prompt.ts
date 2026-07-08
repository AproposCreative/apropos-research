import { buildStyleReferenceBlock } from '@/lib/loadAproposStyleSamples';
import type { PromptSegment } from '@/lib/ai-chat/prompt-segment-types';
import {
  PROMPT_SEGMENT_IDS,
  type PromptSegmentKind,
} from '@/lib/ai-chat/prompt-segment-types';
import { composeSystemPrompt as composeSystemPromptFromLib } from '@/lib/ai-chat/compose-prompt';
import { getEditorialArticleTypeOption } from '@/lib/editorial/signal-store';
import type { EditorialResearchResult } from '@/lib/editorial/types';
import type { ApplicationSection, FundingResearchResult } from '@/lib/funding/types';
import { getApplicationSectionOption } from '@/lib/funding/application-sections';
import fs from 'node:fs';
import path from 'path';

export type { PromptSegment, PromptSegmentKind, PromptSegmentId } from '@/lib/ai-chat/prompt-segment-types';
export { PROMPT_SEGMENT_IDS, LOCKED_SEGMENT_IDS } from '@/lib/ai-chat/prompt-segment-types';
export { composeSystemPrompt } from '@/lib/ai-chat/compose-prompt';

let _structureCache: string | null = null;
function loadStructurePrompt(): string {
  if (_structureCache) return _structureCache;
  try {
    const filePath = path.join(process.cwd(), 'prompts', 'structure.apropos.md');
    _structureCache = fs.readFileSync(filePath, 'utf8');
  } catch {
    _structureCache = '';
  }
  return _structureCache;
}

let _antiPlagCache: string | null = null;
function loadAntiPlagiarismPrompt(): string {
  if (_antiPlagCache) return _antiPlagCache;
  try {
    const filePath = path.join(process.cwd(), 'prompts', 'anti-plagiarism.md');
    _antiPlagCache = fs.readFileSync(filePath, 'utf8');
  } catch {
    _antiPlagCache = '';
  }
  return _antiPlagCache;
}

export const OPENING_STRATEGIES = [
  'Start med en konkret scene eller sanselig detalje — beskriv et øjeblik, en lyd, en stemning du oplever.',
  'Start med et spørgsmål eller en provokerende påstand der fanger læseren.',
  'Start med en personlig betragtning eller en overraskende kontrast mellem forventning og virkelighed.',
  'Start med et kulturelt eller historisk perspektiv — sæt værket i en større kontekst.',
  'Start med en kort anekdote eller et øjebliksbillede fra din oplevelse med værket.',
];

const ANTI_PATTERNS = [
  'Der er noget magisk ved',
  'Lad os bare sige det sådan her',
  'Og hold nu fast',
  'Fra de første billeder',
  'Fra den første scene',
  'det er som om',
  'Det er en rejse',
  'en blanding af',
  'en oplevelse der',
  'rammer dybt',
  'efterlader et indtryk',
  'der vil sætte sig fast',
  'danser i mørket',
  'en hvisken i mørket',
  'pulserer af liv',
];

function cleanEditorialDossierText(input: string): string {
  return input
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/\(\[([^\]]+)\]\(?/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/##\s*Hvad jeg ikke fandt[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type BuildPromptSegmentsOptions = {
  /** Fixed opening line for deterministic preview (otherwise random) */
  openingStrategyOverride?: string;
};

/**
 * Ordered system prompt segments (excluding live web-search append).
 */
export function buildPromptSegments(
  authorTOV: string,
  authorName: string,
  articleContext: Record<string, unknown>,
  notes?: string,
  options?: BuildPromptSegmentsOptions
): PromptSegment[] {
  const openingStrategy =
    options?.openingStrategyOverride ??
    OPENING_STRATEGIES[Math.floor(Math.random() * OPENING_STRATEGIES.length)];

  const baseContent = [
    `Du er "Apropos Writer AI" — redaktionel assistent og medskribent for Apropos Magazine.`,
    `Apropos Magazine skriver kulturjournalistik med personlighed, præcision og perspektiv.`,
    `Alt skal føles menneskeligt, reflekteret og sanseligt — aldrig maskinelt.`,
    `Svar på dansk i en rytmisk, levende og menneskelig tone. Vær konkret og følg brugerens ønsker.`,
    `\n**GLOBAL TOV-REGLER:** Personlig, selvironisk, reflekteret, humoristisk. Brug sanselige detaljer, rytme og variation i sætningslængder. Ingen floskler som "Filmen handler om …" — vis det i stedet. Parafrasér altid kilder; ingen copy/paste.`,
    `\n**ÅBNINGSSTRATEGI FOR DENNE ARTIKEL:** ${openingStrategy}`,
    `\n**ANTI-GENTAGELSES-REGLER:** Undgå følgende AI-klichéer og floskler fuldstændigt: "${ANTI_PATTERNS.slice(0, 8).join('", "')}".\nSkriv i stedet med specifikke, konkrete detaljer fra det værk du anmelder. Nævn navne, steder, scener, dialoger. Vær præcis.`,
    `\n**RESEARCH-KRAV:** Når du skriver om et specifikt værk (film, serie, album, spil osv.), SKAL du inkludere konkrete fakta: navne på instruktører/skabere, skuespillere, udgivelsesår, antal episoder/sæsoner, platform. Hvis du ikke kender fakta, så skriv KUN om det du ved — opfind ALDRIG fakta, navne eller detaljer.`,
  ].join('\n');

  const title = (articleContext?.title || articleContext?.previewTitle) as string | undefined;
  const category = (articleContext?.category || articleContext?.section) as string | undefined;
  const rating = typeof articleContext?.rating === 'number' && articleContext.rating >= 1 && articleContext.rating <= 6 ? articleContext.rating : undefined;
  const platform = (articleContext?.platform || articleContext?.streaming_service) as string | undefined;
  const catLower = (category || '').toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const isSeries = /serie/i.test(catLower) || /serie|sæson|season|episode/i.test(titleLower);

  const metaParts: string[] = [];
  if (title?.trim()) metaParts.push(`\n**Arbejdstitel/emne:** ${title.trim()}`);
  if (category?.trim()) metaParts.push(`**Section/kategori:** ${category.trim()}`);
  if (platform?.trim()) metaParts.push(`**Platform/streamingtjeneste:** ${platform.trim()}`);
  if (isSeries) {
    metaParts.push(
      `\n**VIGTIGT — FORMAT:** Dette er en TV-SERIE, IKKE en film. Brug korrekte termer: "serien", "episoder", "sæson" — ALDRIG "filmen". Omtal det som en serie konsekvent igennem hele artiklen.`
    );
  }
  if (rating != null) {
    metaParts.push(
      `\n**Brugeren har valgt stjernebedømmelse: ${rating} ud af 6.** Bevar denne vurdering i tone og konklusion, men skriv IKKE en "Stjerner:"-linje i selve artikelteksten. Rating håndteres i CMS-metadata.`
    );
  }
  const articleMetaContent = metaParts.join('\n');
  const articleTypeOption = getEditorialArticleTypeOption(articleContext?.articleType as string | undefined);
  const targetLengthLabel =
    (articleContext?.targetLengthLabel as string | undefined) || articleTypeOption.targetLengthLabel;
  const targetWordCount =
    typeof articleContext?.targetWordCount === 'number'
      ? articleContext.targetWordCount
      : articleTypeOption.targetWordCount;
  const articleTypeLengthContent = `\n**ARTIKELTYPE OG LÆNGDE — OVERSTYRER GENERELLE LÆNGDEMÅL:**\nArtikeltype: ${articleTypeOption.label}\nMållængde: ${targetLengthLabel} (ca. ${targetWordCount} ord)\nSkriv til denne længde, også hvis structure.apropos.md nævner bredere standardintervaller.`;

  const editorialResearch = articleContext?.editorialResearch as EditorialResearchResult | null | undefined;
  const editorialDossierContent = editorialResearch?.dossier
    ? [
        '\n**AI-REDAKTIONSCHEF DOSSIER — SKAL BRUGES SOM ARTIKELGRUNDLAG:**',
        `Signal: ${editorialResearch.dossier.signal.title}`,
        `Quality gate: ${editorialResearch.qualityGate.ready ? 'Klar' : 'Kræver opmærksomhed'} (${editorialResearch.qualityGate.score}/100)`,
        `Dansk vinkel: ${editorialResearch.dossier.danishAngle}`,
        `Modvinkel: ${editorialResearch.dossier.counterpoint}`,
        'Key facts:',
        editorialResearch.dossier.keyFacts.slice(0, 8).map((fact, index) => `${index + 1}. ${fact}`).join('\n'),
        'Kilder:',
        editorialResearch.dossier.sources.slice(0, 8).map((source, index) => {
          const sourceName = cleanEditorialDossierText(source.source.replace(/^ChatGPT websearch:\s*/i, '')) || source.domain || 'web';
          const titleText = cleanEditorialDossierText(source.title);
          const contentText = cleanEditorialDossierText(source.content);
          return `${index + 1}. ${titleText}\n   Kilde: ${sourceName}\n   Relevans: ${contentText}`;
        }).join('\n'),
        'Åbne spørgsmål:',
        editorialResearch.dossier.unansweredQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n'),
        'Brug dossieret som researchgrundlag. Opfind ikke fakta, og marker usikkerhed i teksten hvis en pointe ikke er stærkt underbygget.',
      ].filter(Boolean).join('\n')
    : '';

  const fundingResearch = articleContext?.fundingResearch as FundingResearchResult | null | undefined;
  const fundingSection = getApplicationSectionOption(articleContext?.applicationSection as ApplicationSection | undefined);
  const fundingDossierContent = fundingResearch?.dossier
    ? [
        '\n**FUNDING DESK DOSSIER — SKRIV ANSØGNINGSTEKST (IKKE ARTIKEL):**',
        `Mulighed: ${fundingResearch.dossier.opportunity.title}`,
        `Funder: ${fundingResearch.dossier.opportunity.funder}`,
        `Ansøgningssektion: ${fundingSection.label}`,
        `Quality gate: ${fundingResearch.qualityGate.ready ? 'Klar' : 'Kræver opmærksomhed'} (${fundingResearch.qualityGate.score}/100)`,
        `Eligibility: ${fundingResearch.dossier.eligibilityMatch}`,
        fundingResearch.dossier.eligibilityGaps.length
          ? `Gaps:\n${fundingResearch.dossier.eligibilityGaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
          : '',
        `Narrativ vinkel: ${fundingResearch.dossier.narrativeAngle}`,
        'Krævede dokumenter:',
        fundingResearch.dossier.requiredDocuments.map((d, i) => `${i + 1}. ${d}`).join('\n'),
        'Key facts:',
        fundingResearch.dossier.keyFacts.slice(0, 8).map((fact, index) => `${index + 1}. ${fact}`).join('\n'),
        'Kilder:',
        fundingResearch.dossier.sources.slice(0, 8).map((source, index) => {
          const sourceName = cleanEditorialDossierText(source.source.replace(/^ChatGPT websearch:\s*/i, '')) || source.domain || 'web';
          const titleText = cleanEditorialDossierText(source.title);
          const contentText = cleanEditorialDossierText(source.content);
          return `${index + 1}. ${titleText}\n   Kilde: ${sourceName}\n   Relevans: ${contentText}`;
        }).join('\n'),
        'Ubesvarede spørgsmål:',
        fundingResearch.dossier.unansweredQuestions.map((q, index) => `${index + 1}. ${q}`).join('\n'),
        'Opfind ikke beløb, deadlines eller krav der ikke fremgår af kilderne. Skriv professionel ansøgningstekst til Apropos Magazine.',
      ].filter(Boolean).join('\n')
    : '';

  const research = articleContext?.researchSelected as
    | { title?: string; source?: string; keyPoints?: string[]; content?: string }
    | undefined;
  const wizardResearchParts: string[] = [];
  if (research?.title) {
    wizardResearchParts.push(`\n**RESEARCH KILDE (brug KUN som inspiration – parafrasér altid, kopiér ALDRIG):**`);
    wizardResearchParts.push(`Titel: "${research.title}"${research.source ? ` | Kilde: ${research.source}` : ''}`);
    const keyPoints = Array.isArray(research.keyPoints) ? research.keyPoints.slice(0, 6) : [];
    if (keyPoints.length > 0) {
      wizardResearchParts.push(`Nøglepunkter fra research:\n${keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')}`);
    }
    if (research.content && research.content.length > 50) {
      const preview =
        research.content.substring(0, 350).replace(/\s+/g, ' ').trim() + (research.content.length > 350 ? '...' : '');
      wizardResearchParts.push(`Indholdseksempel (kun som kontekst): ${preview}`);
    }
    wizardResearchParts.push(`Skriv en helt original artikel – egen struktur, egne formuleringer, tilføj nye vinkler og kilder.`);
  }
  const wizardResearchContent = wizardResearchParts.join('\n');

  const suggestions = (articleContext?.aiDraft as { suggestions?: string[] } | undefined)?.suggestions;
  const suggestionsContent =
    Array.isArray(suggestions) && suggestions.length > 0
      ? `\n**AI FORSLAG (inkluder disse vinkler i artiklen):**\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '';

  const draftPrompt = (articleContext?.aiDraft as { prompt?: string } | undefined)?.prompt;
  const setupPromptContent =
    draftPrompt && draftPrompt.length > 20 ? `\n**Instruktioner fra artikelopsætning:**\n${draftPrompt.trim()}` : '';

  const notesContent = notes && notes.trim().length > 0 ? `\n**Redaktionelle noter fra bruger (skal prioriteres):**\n${notes.trim()}` : '';

  const structureRules = loadStructurePrompt();
  const structureContent = structureRules
    ? `\n**APROPOS STRUCTURE (fra structure.apropos.md) — Følg PRÆCIS:**\n${structureRules}`
    : '';

  const antiPlagRules = loadAntiPlagiarismPrompt();
  const antiPlagContent = antiPlagRules ? `\n${antiPlagRules}` : '';

  const styleRef = buildStyleReferenceBlock(category as string | undefined);

  const outputFormatContent = `\n**OUTPUT-FORMAT (felter til CMS — følg præcist):**
- Linje 1: Arbejdstitel: [kun titeltekst]
- Linje 2: Undertitel: [8–14 ord]
- Derefter en linje der starter med **Intro:** (eller Indledning:) og hele intro-teksten på samme linje eller fortsat i samme afsnit indtil tom linje.
- Tom linje
- Derefter en linje der starter med **Brødtekst:** (eller Body:) og HELE brødteksten efter denne etiket. Alt efter "Brødtekst:" er kun brødtekst — må ikke gentage intro-teksten.
- Første sætning efter Brødtekst: skal være en HELT NY tanke ift. introen (ny vinkel, scene eller faktum).
- ALDRIG gentag titel, undertitel eller intro ordret eller parafraseret i brødteksten.
- Skriv ALDRIG "Længde: X ord".`;

  const template = (articleContext?.template as string | undefined)?.trim();
  const templateContent = template ? `\n**Valgt template:** ${template}` : '';

  const authorTovContent = authorTOV?.trim() ? `\n**Valgt tone (TOV) for denne artikel:**\n${authorTOV.trim()}` : '';
  const authorNameContent = authorName?.trim() ? `\n**Forfatter:** ${authorName.trim()}` : '';

  const segments: PromptSegment[] = [
    {
      id: PROMPT_SEGMENT_IDS.base,
      labelDa: 'Kerne + globale regler',
      kind: 'system',
      content: baseContent,
      included: true,
      locked: true,
    },
    {
      id: PROMPT_SEGMENT_IDS.authorTov,
      labelDa: 'Forfatter-TOV',
      kind: 'system',
      content: authorTovContent,
      included: authorTovContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.authorName,
      labelDa: 'Forfatternavn',
      kind: 'system',
      content: authorNameContent,
      included: authorNameContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.template,
      labelDa: 'Template',
      kind: 'system',
      content: templateContent,
      included: templateContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.articleMeta,
      labelDa: 'Artikel-meta (titel, sektion, platform …)',
      kind: 'system',
      content: articleMetaContent,
      included: articleMetaContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.articleTypeLength,
      labelDa: 'Artikeltype og længde',
      kind: 'system',
      content: articleTypeLengthContent,
      included: true,
      locked: true,
    },
    {
      id: PROMPT_SEGMENT_IDS.editorialDossier,
      labelDa: 'AI-redaktionschef dossier',
      kind: 'system',
      content: editorialDossierContent,
      included: editorialDossierContent.length > 0,
      locked: true,
    },
    {
      id: PROMPT_SEGMENT_IDS.fundingDossier,
      labelDa: 'Funding Desk dossier',
      kind: 'system',
      content: fundingDossierContent,
      included: fundingDossierContent.length > 0,
      locked: true,
    },
    {
      id: PROMPT_SEGMENT_IDS.wizardResearch,
      labelDa: 'Research valgt (wizard)',
      kind: 'system',
      content: wizardResearchContent,
      included: wizardResearchContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.aiSuggestions,
      labelDa: 'AI-forslag',
      kind: 'system',
      content: suggestionsContent,
      included: suggestionsContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.setupPrompt,
      labelDa: 'Opsætningsguide (wizard)',
      kind: 'system',
      content: setupPromptContent,
      included: setupPromptContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.editorNotes,
      labelDa: 'Redaktionelle noter',
      kind: 'system',
      content: notesContent,
      included: notesContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.structure,
      labelDa: 'Struktur (structure.apropos.md)',
      kind: 'system',
      content: structureContent,
      included: structureContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.antiPlagiarism,
      labelDa: 'Anti-plagiat',
      kind: 'system',
      content: antiPlagContent,
      included: antiPlagContent.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.styleSamples,
      labelDa: 'Stil-eksempler (publicerede artikler)',
      kind: 'system',
      content: styleRef,
      included: !!styleRef && styleRef.length > 0,
    },
    {
      id: PROMPT_SEGMENT_IDS.outputFormat,
      labelDa: 'Output-format (CMS)',
      kind: 'system',
      content: outputFormatContent,
      included: true,
      locked: true,
    },
  ];

  return segments;
}

export function buildWebSearchSegment(contextText: string | undefined | null): PromptSegment | null {
  const t = (contextText || '').trim();
  if (!t) return null;
  const content = `\n\n**FAKTA FRA WEB-SØGNING (brug aktivt — væv konkrete fakta, navne og detaljer ind i artiklen):**\n${t}\nBrug disse fakta til at gøre artiklen specifik og faktuel. Nævn instruktører, skuespillere, antal episoder, udgivelsesdato osv. direkte i teksten.`;
  return {
    id: PROMPT_SEGMENT_IDS.webFacts,
    labelDa: 'Web-søgning (fakta)',
    kind: 'web-append',
    content,
    included: true,
  };
}

/** Backwards-compatible single string builder (random opening, no toggles, no web). */
export function buildSystemPromptString(
  authorTOV: string,
  authorName: string,
  articleContext: Record<string, unknown>,
  notes?: string
): string {
  const segments = buildPromptSegments(authorTOV, authorName, articleContext, notes);
  return composeSystemPromptFromLib(segments, undefined, null);
}

/** Matches ai-chat route: web search runs when wizard research or at least article title exists */
export function hasResearchContext(articleData: Record<string, unknown>): boolean {
  const rs = articleData?.researchSelected as { title?: string } | undefined;
  return !!(rs?.title || articleData?.title);
}
