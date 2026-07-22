/**
 * Coerce partial AI strategy JSON into Zod-compatible SeoStrategyPackV1 shape.
 * Models often omit secondary SeoField wrappers (supportingTopics, tags, …).
 */

import { getCmsPublishability } from '@/lib/seo-engine/webflow-adapter';
import { SEO_ENGINE_SCHEMA_VERSION } from '@/lib/seo-engine/versions';

type AnyRec = Record<string, unknown>;

function asRec(v: unknown): AnyRec | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyRec) : null;
}

function coerceSeoField(raw: unknown, fallbackValue: unknown): AnyRec {
  const obj = asRec(raw);
  if (obj && 'value' in obj) {
    return {
      value: obj.value !== undefined ? obj.value : fallbackValue,
      rationale: typeof obj.rationale === 'string' ? obj.rationale : 'ai',
      confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5,
      sources:
        Array.isArray(obj.sources) && obj.sources.length > 0
          ? obj.sources
          : ['inference'],
      ...(typeof obj.characterCount === 'number'
        ? { characterCount: obj.characterCount }
        : {}),
      warnings: Array.isArray(obj.warnings) ? obj.warnings : [],
      locked: typeof obj.locked === 'boolean' ? obj.locked : false,
    };
  }
  // Bare primitive / array used as value
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    return {
      value: raw,
      rationale: 'ai',
      confidence: 0.5,
      sources: ['inference'],
      warnings: ['coerced_bare_value'],
      locked: false,
    };
  }
  return {
    value: fallbackValue,
    rationale: 'filled_by_coercion',
    confidence: 0.3,
    sources: ['inference'],
    warnings: ['ai_partial_field'],
    locked: false,
  };
}

const FIELD_FALLBACKS: Record<string, unknown> = {
  seoTitle: '',
  metaDescription: '',
  slug: '',
  canonical: '',
  ogTitle: '',
  ogDescription: '',
  primaryPhrase: '',
  supportingTopics: [],
  tags: [],
  section: '',
  imageAlt: '',
  imageCaption: null,
  internalLinks: [],
  externalLinks: [],
  jsonLd: { '@context': 'https://schema.org', '@graph': [] },
  checklist: [],
  risks: [],
};

function coerceDirection(raw: unknown, index: number): AnyRec {
  const d = asRec(raw) || {};
  const fieldsIn = asRec(d.fields) || {};
  const fields: AnyRec = {};
  for (const [key, fallback] of Object.entries(FIELD_FALLBACKS)) {
    fields[key] = coerceSeoField(fieldsIn[key], fallback);
  }
  return {
    id: typeof d.id === 'string' && d.id ? d.id : `strategy-${index + 1}`,
    family:
      typeof d.family === 'string' && d.family
        ? d.family
        : 'entity_first',
    intentPriority: typeof d.intentPriority === 'string' ? d.intentPriority : 'informational',
    whyFits: typeof d.whyFits === 'string' ? d.whyFits : '',
    primaryEntityEmphasis:
      typeof d.primaryEntityEmphasis === 'string' ? d.primaryEntityEmphasis : '',
    freshnessStance: typeof d.freshnessStance === 'string' ? d.freshnessStance : '',
    editorialGuardrail: typeof d.editorialGuardrail === 'string' ? d.editorialGuardrail : '',
    riskAvoided: typeof d.riskAvoided === 'string' ? d.riskAvoided : '',
    fields,
  };
}

/**
 * Fill missing SeoField wrappers / direction metadata before Zod parse.
 * Does not invent seoTitle/meta values when present; only completes structure.
 */
export function coerceStrategyPackAiOutput(raw: unknown): unknown {
  const root = asRec(raw) || {};
  const altsIn = Array.isArray(root.alternatives) ? root.alternatives : [];
  const recommended = coerceDirection(root.recommended, 0);
  const alternatives = [0, 1].map((i) => coerceDirection(altsIn[i], i + 1));
  const pub = asRec(root.cmsPublishability);
  return {
    schemaVersion:
      typeof root.schemaVersion === 'string' && root.schemaVersion
        ? root.schemaVersion
        : SEO_ENGINE_SCHEMA_VERSION,
    recommendedStrategyId:
      typeof root.recommendedStrategyId === 'string' && root.recommendedStrategyId
        ? root.recommendedStrategyId
        : String(recommended.id),
    recommended,
    alternatives,
    cmsPublishability: pub?.seoTitle ? pub : getCmsPublishability(),
  };
}
