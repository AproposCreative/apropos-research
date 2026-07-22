import type {
  EditorialAnalysisV1,
  PublishFields,
  SeoEngineInputContract,
  SeoField,
  SeoStrategyPackV1,
} from '@/lib/seo-engine/schema';
import { hashQuote } from '@/lib/seo-engine/hash';
import { locateQuoteInText } from '@/lib/seo-engine/long-article';
import { buildJsonLd } from '@/lib/seo-engine/jsonld';
import { getCmsPublishability } from '@/lib/seo-engine/webflow-adapter';
import { SEO_ENGINE_SCHEMA_VERSION } from '@/lib/seo-engine/versions';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '@/lib/seo/constants';

function fieldStr(
  value: string,
  rationale: string,
  confidence: number,
  locked = false
): SeoField<string> {
  return {
    value,
    rationale,
    confidence,
    sources: ['inference', 'article'],
    characterCount: value.length,
    warnings: [],
    locked,
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 20 ? cut.slice(0, sp) : cut).trim();
}

function evidenceFrom(
  normalizedText: string,
  quote: string,
  articleVersionHash: string
) {
  const loc = locateQuoteInText(normalizedText, quote);
  if (!loc) return [];
  return [
    {
      quote: loc.quote,
      startOffset: loc.startOffset,
      endOffset: loc.endOffset,
      quoteHash: hashQuote(loc.quote),
      articleVersionHash,
    },
  ];
}

/**
 * Deterministic demo/heuristic Fase A — marked as non-AI.
 * Used when SEO_ENGINE_DEMO=true or OpenAI unavailable in demo mode.
 */
export function buildDemoAnalysis(args: {
  input: SeoEngineInputContract;
  normalizedText: string;
  inputVersionHash: string;
  inputMode: 'full' | 'long_article_extract';
}): EditorialAnalysisV1 {
  const { input, normalizedText, inputVersionHash, inputMode } = args;
  const suggested =
    input.articleType?.trim() ||
    (/\banmeldelse\b/i.test(input.editorialTitle + input.body.slice(0, 500))
      ? 'Anmeldelse'
      : 'Feature');
  const editor = input.articleType?.trim();
  const conflict = Boolean(editor && editor.toLowerCase() !== suggested.toLowerCase());

  const entityGuess =
    input.editorialTitle.split(/[:–—-]/)[0]?.trim() || input.editorialTitle.trim();
  const quoteSeed = input.intro?.slice(0, 120) || input.body.slice(0, 120);
  const ev = evidenceFrom(normalizedText, quoteSeed, inputVersionHash);

  const missing: string[] = [];
  if (!input.premiereOrReleaseDate) missing.push('Premieredato');
  if (inputMode === 'long_article_extract') {
    missing.push('Afslutning kun delvist med i long-article extract');
  }

  return {
    schemaVersion: SEO_ENGINE_SCHEMA_VERSION,
    articleType: {
      editor,
      suggested,
      conflict,
      confidence: editor ? 0.85 : 0.55,
      reason: editor
        ? 'Redaktørens artikeltype anvendt; demo foreslår ud fra tekstsignaler'
        : 'Demo-heuristik ud fra titel/brødtekst',
    },
    topic: {
      value: entityGuess,
      confidence: 0.6,
      reason: 'Demo: afledt af redaktionel titel',
      factLevel: 'inferred',
      evidence: ev,
    },
    angleOrThesis: {
      value: input.subtitle || 'Redaktionel vurdering af emnet',
      confidence: 0.45,
      reason: 'Demo-heuristik',
      factLevel: 'inferred',
    },
    primaryEntity: {
      asWritten: entityGuess,
      likelyOfficialName: entityGuess,
      entityType: 'unknown',
      evidence: ev,
      confidence: 0.55,
    },
    secondaryEntities: [],
    work: entityGuess,
    // artist is a subject (band/actor/etc.), never the article author
    platform: input.streamingPlatform,
    festival: input.festival,
    venue: input.venue,
    city: input.city,
    stanceOrVerdict: {
      value:
        typeof input.rating === 'number'
          ? `Vurdering omkring ${input.rating}/6 (demo)`
          : 'Holdning ikke sikkert udledt i demo',
      confidence: typeof input.rating === 'number' ? 0.5 : 0.3,
      reason: 'Demo',
      factLevel: 'inferred',
    },
    audiences: ['Kulturinteresserede læsere'],
    searchIntent: { primary: 'evaluative_review', secondary: 'entity_info' },
    freshness: {
      evergreen: input.freshnessHint !== 'timely',
      timely: input.freshnessHint === 'timely' || input.freshnessHint === 'both',
      dateSensitive: Boolean(input.premiereOrReleaseDate || input.eventDate),
    },
    spoilerSensitive: false,
    facts: {
      verified: input.knownFacts || [],
      articleClaims: [],
      inferred: [`Primær entitet antaget: ${entityGuess}`],
      mustNotAmplify: [],
      missing,
    },
    opportunities: {
      entityLed: [
        {
          label: `${entityGuess} anmeldelse`,
          kind: 'heuristic_editorial_opportunity',
          confidence: 0.5,
          reason: 'Demo entity-led mulighed',
        },
      ],
      intentLed: [],
      angleLed: [],
      timely: [],
      evergreen: [],
    },
  };
}

function buildFieldsFromAnalysis(
  input: SeoEngineInputContract,
  analysis: EditorialAnalysisV1
): PublishFields {
  const entity = analysis.primaryEntity.asWritten;
  const type = analysis.articleType.suggested;
  let seoTitle = `${entity} — ${type}`.trim();
  if (input.existingSeoTitle?.trim()) {
    seoTitle = input.existingSeoTitle.trim();
  }
  seoTitle = truncate(seoTitle, SEO_TITLE_MAX);

  let metaDescription =
    input.intro?.trim() ||
    analysis.angleOrThesis.value ||
    `${type} af ${entity} hos Apropos Magazine.`;
  if (input.existingMetaDescription?.trim()) {
    metaDescription = input.existingMetaDescription.trim();
  }
  metaDescription = truncate(metaDescription, SEO_DESCRIPTION_MAX);

  const slug = input.existingSlug?.trim() || slugify(`${entity}-${type}`);
  const jsonLd = buildJsonLd({
    input,
    analysis,
    seoTitle,
    metaDescription,
  });

  const lockedTitle = Boolean(input.existingSeoTitle?.trim());
  const lockedMeta = Boolean(input.existingMetaDescription?.trim());

  return {
    seoTitle: fieldStr(seoTitle, 'Entity + artikeltype (demo/strategy)', 0.55, lockedTitle),
    metaDescription: fieldStr(
      metaDescription,
      'Intro/vinkel som meta (demo/strategy)',
      0.5,
      lockedMeta
    ),
    slug: fieldStr(slug, 'Slug fra entitet', 0.6),
    canonical: fieldStr(input.existingUrl || '', 'Eksisterende URL hvis kendt', 0.4),
    ogTitle: fieldStr(seoTitle, 'Spejler SEO-title indtil CMS har OG-felter', 0.4),
    ogDescription: fieldStr(metaDescription, 'Spejler meta description', 0.4),
    primaryPhrase: fieldStr(`${entity} ${type}`.toLowerCase(), 'Entity-led frase', 0.45),
    supportingTopics: {
      value: analysis.secondaryEntities.map((e) => e.name).slice(0, 8),
      rationale: 'Sekundære entiteter',
      confidence: 0.4,
      sources: ['inference'],
      warnings: [],
      locked: false,
    },
    tags: {
      value: [type, entity].filter(Boolean),
      rationale: 'Type + entitet',
      confidence: 0.4,
      sources: ['inference'],
      warnings: [],
      locked: false,
    },
    section: fieldStr(input.section || type, 'Sektion fra input/type', 0.5),
    imageAlt: fieldStr(
      input.primaryImage?.description || `${entity} — Apropos Magazine`,
      'Billedbeskrivelse eller entity',
      0.4
    ),
    imageCaption: {
      value: input.primaryImage?.description || null,
      rationale: 'Kun hvis billedbeskrivelse findes',
      confidence: 0.3,
      sources: ['editor_metadata'],
      warnings: [],
      locked: false,
    },
    internalLinks: {
      value: (input.relatedAproposArticles || [])
        .filter((a) => a.url || a.title)
        .slice(0, 5)
        .map((a) => ({
          url: a.url,
          targetArticleKey: a.id,
          anchorText: a.title || entity,
          rationale: 'Relateret artikel fra input',
        })),
      rationale: 'Fra relatedAproposArticles',
      confidence: 0.5,
      sources: ['editor_metadata'],
      warnings: [],
      locked: false,
    },
    externalLinks: {
      value: [
        input.streamingLink && { url: input.streamingLink, label: 'Streaming' },
        input.ticketLink && { url: input.ticketLink, label: 'Billetter' },
        input.trailerLink && { url: input.trailerLink, label: 'Trailer' },
      ].filter(Boolean) as Array<{ url: string; label: string }>,
      rationale: 'Links fra editor metadata',
      confidence: 0.7,
      sources: ['editor_metadata'],
      warnings: [],
      locked: false,
    },
    jsonLd: {
      value: jsonLd,
      rationale: 'Deterministisk JSON-LD builder',
      confidence: 0.6,
      sources: ['inference', 'article'],
      warnings: ['generated_not_published'],
      locked: false,
    },
    checklist: {
      value: [
        {
          id: 'entity_clear',
          label: 'Primær entitet tydelig i SEO-title',
          done: seoTitle.toLowerCase().includes(entity.toLowerCase().slice(0, 12)),
          severity: 'warn',
        },
        {
          id: 'missing_facts',
          label: 'Manglende fakta kontrolleret',
          done: analysis.facts.missing.length === 0,
          severity: analysis.facts.missing.length ? 'warn' : 'info',
        },
      ],
      rationale: 'Publiceringscheckliste',
      confidence: 0.5,
      sources: ['inference'],
      warnings: [],
      locked: false,
    },
    risks: {
      value: analysis.facts.missing.map((m) => ({
        code: 'missing_fact',
        message: m,
        severity: 'warn' as const,
      })),
      rationale: 'Fra analyse.facts.missing',
      confidence: 0.5,
      sources: ['inference'],
      warnings: [],
      locked: false,
    },
  };
}

export function buildDemoStrategyPack(args: {
  input: SeoEngineInputContract;
  analysis: EditorialAnalysisV1;
}): SeoStrategyPackV1 {
  const fields = buildFieldsFromAnalysis(args.input, args.analysis);
  const entity = args.analysis.primaryEntity.asWritten;
  const recommended = {
    id: 'entity_first',
    family: 'entity_first' as const,
    intentPriority: args.analysis.searchIntent.primary,
    whyFits: 'Primær entitet er det stærkeste søgesignal i demo-strategien',
    primaryEntityEmphasis: entity,
    freshnessStance: args.analysis.freshness.timely ? 'kombination' : 'evergreen',
    editorialGuardrail: 'Bevar artiklens holdning; overskriv ikke redaktionel titel',
    riskAvoided: 'Clickbait uden dækning i teksten',
    fields,
  };

  const angleFields = buildFieldsFromAnalysis(args.input, args.analysis);
  if (!angleFields.seoTitle.locked) {
    const angleTitle = truncate(
      args.analysis.angleOrThesis.value || `${entity} — vinkel`,
      SEO_TITLE_MAX
    );
    angleFields.seoTitle = fieldStr(angleTitle, 'Angle-first title', 0.4, false);
    angleFields.ogTitle = fieldStr(angleTitle, 'Spejler angle title', 0.35);
    angleFields.jsonLd = {
      ...angleFields.jsonLd,
      value: buildJsonLd({
        input: args.input,
        analysis: args.analysis,
        seoTitle: angleFields.seoTitle.value,
        metaDescription: angleFields.metaDescription.value,
      }),
    };
  }

  const evergreenFields = buildFieldsFromAnalysis(args.input, args.analysis);
  if (!evergreenFields.seoTitle.locked) {
    const evergreenTitle = truncate(
      `${entity}: ${args.analysis.topic.value || 'evergreen guide'}`,
      SEO_TITLE_MAX
    );
    evergreenFields.seoTitle = fieldStr(evergreenTitle, 'Evergreen-first title', 0.4, false);
    evergreenFields.ogTitle = fieldStr(evergreenTitle, 'Spejler evergreen title', 0.35);
    evergreenFields.primaryPhrase = fieldStr(
      `${entity} guide`.toLowerCase(),
      'Evergreen frase',
      0.4
    );
    evergreenFields.jsonLd = {
      ...evergreenFields.jsonLd,
      value: buildJsonLd({
        input: args.input,
        analysis: args.analysis,
        seoTitle: evergreenFields.seoTitle.value,
        metaDescription: evergreenFields.metaDescription.value,
      }),
    };
  } else {
    evergreenFields.primaryPhrase = fieldStr(
      `${entity} guide`.toLowerCase(),
      'Evergreen frase',
      0.4
    );
  }

  const alternatives = [
    {
      id: 'angle_first',
      family: 'angle_first' as const,
      intentPriority: 'angle',
      whyFits: 'Prioriterer artiklens tese over ren entity-match',
      primaryEntityEmphasis: entity,
      freshnessStance: 'evergreen',
      editorialGuardrail: 'Entity skal stadig kunne genkendes i brødtekst/meta',
      riskAvoided: 'At miste søgbarhed på værk/navn',
      fields: angleFields,
    },
    {
      id: 'evergreen_first',
      family: 'evergreen_first' as const,
      intentPriority: 'evergreen',
      whyFits: 'Prioriterer langtidsholdbar søgeintention',
      primaryEntityEmphasis: entity,
      freshnessStance: 'evergreen',
      editorialGuardrail: 'Undgå dato-afhængige claims uden evidens',
      riskAvoided: 'At låse metadata til et kort nyhedsvindue',
      fields: evergreenFields,
    },
  ];

  return {
    schemaVersion: SEO_ENGINE_SCHEMA_VERSION,
    recommendedStrategyId: 'entity_first',
    recommended,
    alternatives,
    cmsPublishability: getCmsPublishability(),
  };
}
