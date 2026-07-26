import { z } from 'zod';

export const FactLevelSchema = z.enum(['verified', 'article_claim', 'inferred']);
export type FactLevel = z.infer<typeof FactLevelSchema>;

export const FieldSourceSchema = z.enum([
  'article',
  'editor_metadata',
  'verified_fact',
  'inference',
]);
export type FieldSource = z.infer<typeof FieldSourceSchema>;

export const ConfidenceBandSchema = z.enum(['high', 'medium', 'low']);
export type ConfidenceBand = z.infer<typeof ConfidenceBandSchema>;

export const RawConfidenceSchema = z.number().min(0).max(1);
export type RawConfidence = z.infer<typeof RawConfidenceSchema>;

export const ArticleEvidenceSchema = z.object({
  quote: z.string().max(180),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  quoteHash: z.string().min(8),
  articleVersionHash: z.string().min(8),
});
export type ArticleEvidence = z.infer<typeof ArticleEvidenceSchema>;

export function JudgementSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    confidence: RawConfidenceSchema,
    reason: z.string(),
    evidence: z.array(ArticleEvidenceSchema).optional(),
    factLevel: FactLevelSchema,
  });
}

export function SeoFieldSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    rationale: z.string(),
    confidence: RawConfidenceSchema,
    sources: z.array(FieldSourceSchema).min(1),
    characterCount: z.number().int().nonnegative().optional(),
    warnings: z.array(z.string()),
    locked: z.boolean(),
  });
}
export type SeoField<T> = {
  value: T;
  rationale: string;
  confidence: RawConfidence;
  sources: FieldSource[];
  characterCount?: number;
  warnings: string[];
  locked: boolean;
};

export const InternalLinkSuggestionSchema = z.object({
  targetArticleKey: z.string().optional(),
  url: z.string().optional(),
  anchorText: z.string(),
  rationale: z.string(),
});
export type InternalLinkSuggestion = z.infer<typeof InternalLinkSuggestionSchema>;

export const ChecklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  done: z.boolean(),
  severity: z.enum(['info', 'warn', 'block']),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const RiskItemSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['warn', 'block']),
});
export type RiskItem = z.infer<typeof RiskItemSchema>;

export const JsonLdGraphSchema = z.object({
  '@context': z.literal('https://schema.org'),
  '@graph': z.array(z.record(z.string(), z.unknown())),
});
export type JsonLdGraph = z.infer<typeof JsonLdGraphSchema>;

const HttpUrlSchema = z
  .string()
  .max(2000)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'URL skal være http(s)');

const OptionalHttpUrlSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  HttpUrlSchema.optional()
);

export const RelatedArticleSchema = z.object({
  id: z.string().max(120).optional(),
  url: OptionalHttpUrlSchema,
  title: z.string().max(300).optional(),
});

export const SeoEngineInputContractSchema = z.object({
  editorialTitle: z.string().min(1).max(300),
  language: z.enum(['da', 'en']),
  body: z.string().max(500_000),
  subtitle: z.string().max(500).optional(),
  intro: z.string().max(8_000).optional(),
  author: z.string().max(200).optional(),
  section: z.string().max(200).optional(),
  articleType: z.string().max(120).optional(),
  rating: z.number().min(1).max(6).optional(),
  streamingPlatform: z.string().max(200).optional(),
  festival: z.string().max(200).optional(),
  venue: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  publishDate: z.string().max(64).optional(),
  /** CMS lastUpdated / last modified — never used as datePublished. */
  dateModified: z.string().max(64).optional(),
  eventDate: z.string().max(64).optional(),
  premiereOrReleaseDate: z.string().max(64).optional(),
  existingUrl: OptionalHttpUrlSchema,
  existingSlug: z.string().max(200).optional(),
  primaryImage: z
    .object({
      url: OptionalHttpUrlSchema,
      description: z.string().max(500).optional(),
    })
    .optional(),
  ticketLink: OptionalHttpUrlSchema,
  streamingLink: OptionalHttpUrlSchema,
  trailerLink: OptionalHttpUrlSchema,
  relatedAproposArticles: z.array(RelatedArticleSchema).max(20).optional(),
  knownFacts: z.array(z.string().max(500)).max(40).optional(),
  notesForAi: z.string().max(4_000).optional(),
  freshnessHint: z.enum(['evergreen', 'timely', 'both']).optional(),
  existingSeoTitle: z.string().max(300).nullable().optional(),
  existingMetaDescription: z.string().max(500).nullable().optional(),
});
export type SeoEngineInputContract = z.infer<typeof SeoEngineInputContractSchema>;

export const AllowlistedFieldPathSchema = z.enum([
  'seoTitle',
  'metaDescription',
  'slug',
  'canonical',
  'ogTitle',
  'ogDescription',
  'primaryPhrase',
  'supportingTopics',
  'tags',
  'section',
  'imageAlt',
  'imageCaption',
  'internalLinks',
  'externalLinks',
  'jsonLd',
]);
export type AllowlistedFieldPath = z.infer<typeof AllowlistedFieldPathSchema>;

export const PublishFieldsSchema = z.object({
  seoTitle: SeoFieldSchema(z.string()),
  metaDescription: SeoFieldSchema(z.string()),
  slug: SeoFieldSchema(z.string()),
  canonical: SeoFieldSchema(z.string()),
  ogTitle: SeoFieldSchema(z.string()),
  ogDescription: SeoFieldSchema(z.string()),
  primaryPhrase: SeoFieldSchema(z.string()),
  supportingTopics: SeoFieldSchema(z.array(z.string())),
  tags: SeoFieldSchema(z.array(z.string())),
  section: SeoFieldSchema(z.string()),
  imageAlt: SeoFieldSchema(z.string()),
  imageCaption: SeoFieldSchema(z.string().nullable()),
  internalLinks: SeoFieldSchema(z.array(InternalLinkSuggestionSchema)),
  externalLinks: SeoFieldSchema(
    z.array(z.object({ url: z.string(), label: z.string() }))
  ),
  jsonLd: SeoFieldSchema(JsonLdGraphSchema),
  checklist: SeoFieldSchema(z.array(ChecklistItemSchema)),
  risks: SeoFieldSchema(z.array(RiskItemSchema)),
});
export type PublishFields = z.infer<typeof PublishFieldsSchema>;

export const CmsPublishabilitySchema = z.object({
  seoTitle: z.literal('cms_writable'),
  metaDescription: z.literal('cms_writable'),
  ogTitle: z.literal('generated_not_published'),
  ogDescription: z.literal('generated_not_published'),
  jsonLd: z.literal('generated_not_published'),
});
export type CmsPublishability = z.infer<typeof CmsPublishabilitySchema>;

export const HeuristicOpportunitySchema = z.object({
  label: z.string(),
  kind: z.literal('heuristic_editorial_opportunity'),
  confidence: RawConfidenceSchema,
  reason: z.string(),
});

export const EditorialAnalysisV1Schema = z.object({
  schemaVersion: z.string(),
  articleType: z.object({
    editor: z.string().optional(),
    suggested: z.string(),
    conflict: z.boolean(),
    confidence: RawConfidenceSchema,
    reason: z.string(),
  }),
  topic: JudgementSchema(z.string()),
  angleOrThesis: JudgementSchema(z.string()),
  primaryEntity: z.object({
    asWritten: z.string(),
    likelyOfficialName: z.string().optional(),
    entityType: z.string(),
    evidence: z.array(ArticleEvidenceSchema),
    confidence: RawConfidenceSchema,
  }),
  secondaryEntities: z.array(
    z.object({
      name: z.string(),
      entityType: z.string(),
      relation: z.string().optional(),
      confidence: RawConfidenceSchema,
    })
  ),
  work: z.string().optional(),
  artist: z.string().optional(),
  platform: z.string().optional(),
  festival: z.string().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  stanceOrVerdict: JudgementSchema(z.string()),
  audiences: z.array(z.string()),
  searchIntent: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
  }),
  freshness: z.object({
    evergreen: z.boolean(),
    timely: z.boolean(),
    dateSensitive: z.boolean(),
  }),
  spoilerSensitive: z.boolean(),
  facts: z.object({
    verified: z.array(z.string()),
    articleClaims: z.array(z.string()),
    inferred: z.array(z.string()),
    mustNotAmplify: z.array(z.string()),
    missing: z.array(z.string()),
  }),
  opportunities: z.object({
    entityLed: z.array(HeuristicOpportunitySchema),
    intentLed: z.array(HeuristicOpportunitySchema),
    angleLed: z.array(HeuristicOpportunitySchema),
    timely: z.array(HeuristicOpportunitySchema),
    evergreen: z.array(HeuristicOpportunitySchema),
  }),
});
export type EditorialAnalysisV1 = z.infer<typeof EditorialAnalysisV1Schema>;

export const StrategyFamilySchema = z.enum([
  'entity_first',
  'angle_first',
  'evergreen_first',
  'timely_first',
]);
export type StrategyFamily = z.infer<typeof StrategyFamilySchema>;

export const StrategyDirectionSchema = z.object({
  id: z.string(),
  family: StrategyFamilySchema,
  intentPriority: z.string(),
  whyFits: z.string(),
  primaryEntityEmphasis: z.string(),
  freshnessStance: z.string(),
  editorialGuardrail: z.string(),
  riskAvoided: z.string(),
  fields: PublishFieldsSchema,
});
export type StrategyDirection = z.infer<typeof StrategyDirectionSchema>;

export const SeoStrategyPackV1Schema = z.object({
  schemaVersion: z.string(),
  recommendedStrategyId: z.string(),
  recommended: StrategyDirectionSchema,
  alternatives: z.array(StrategyDirectionSchema).length(2),
  cmsPublishability: CmsPublishabilitySchema,
});
export type SeoStrategyPackV1 = z.infer<typeof SeoStrategyPackV1Schema>;
