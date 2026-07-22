/**
 * Coerce partial AI strategy JSON into Zod-compatible SeoStrategyPackV1 shape.
 *
 * Allowed: fill missing *secondary* SeoField wrappers (tags, links, …).
 * Forbidden: inventing/replacing seoTitle or metaDescription values.
 * Fail closed: incomplete recommended OR incomplete alternatives → throw.
 */

import { getCmsPublishability } from '@/lib/seo-engine/webflow-adapter';
import { SEO_ENGINE_SCHEMA_VERSION } from '@/lib/seo-engine/versions';

type AnyRec = Record<string, unknown>;

const VALID_SOURCES = new Set([
  'article',
  'editor_metadata',
  'verified_fact',
  'inference',
]);

const VALID_FAMILIES = new Set([
  'entity_first',
  'angle_first',
  'evergreen_first',
  'timely_first',
]);

const CORE_TEXT_FIELDS = ['seoTitle', 'metaDescription'] as const;

const SECONDARY_FALLBACKS: Record<string, unknown> = {
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

export class StrategyCoerceError extends Error {
  readonly code = 'ai_schema_error';
  constructor(message: string) {
    super(message);
    this.name = 'StrategyCoerceError';
  }
}

function asRec(v: unknown): AnyRec | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyRec) : null;
}

function readCoreTextValue(raw: unknown): string | null {
  const obj = asRec(raw);
  if (obj && 'value' in obj) {
    if (typeof obj.value !== 'string') return null;
    const t = obj.value.trim();
    return t || null;
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t || null;
  }
  return null;
}

function normalizeSources(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ['inference'];
  const cleaned = raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => VALID_SOURCES.has(s));
  return cleaned.length > 0 ? cleaned : ['inference'];
}

/**
 * Complete SeoField *structure* around an existing value.
 * Never invents the value — caller must supply it for core fields.
 */
function coerceSeoFieldAroundValue(raw: unknown, value: unknown): AnyRec {
  const obj = asRec(raw);
  return {
    value,
    rationale: typeof obj?.rationale === 'string' && obj.rationale.trim() ? obj.rationale : 'ai',
    confidence: typeof obj?.confidence === 'number' ? obj.confidence : 0.5,
    sources: normalizeSources(obj?.sources),
    ...(typeof obj?.characterCount === 'number' ? { characterCount: obj.characterCount } : {}),
    warnings: Array.isArray(obj?.warnings)
      ? obj.warnings.filter((w): w is string => typeof w === 'string')
      : [],
    locked: typeof obj?.locked === 'boolean' ? obj.locked : false,
  };
}

/** Secondary fields only — may use empty fallbacks when AI omitted the field. */
function coerceSecondaryField(raw: unknown, fallbackValue: unknown): AnyRec {
  const obj = asRec(raw);
  if (obj && 'value' in obj) {
    return coerceSeoFieldAroundValue(obj, obj.value !== undefined ? obj.value : fallbackValue);
  }
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    return coerceSeoFieldAroundValue(
      { rationale: 'ai', warnings: ['coerced_bare_value'] },
      raw
    );
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

function coerceStringOrNullField(raw: unknown, allowNull: boolean): AnyRec {
  const obj = asRec(raw);
  let value: string | null | undefined;
  if (obj && 'value' in obj) {
    if (typeof obj.value === 'string') value = obj.value;
    else if (allowNull && obj.value === null) value = null;
    else value = allowNull ? null : '';
  } else if (typeof raw === 'string') {
    value = raw;
  } else if (allowNull && (raw === null || raw === undefined)) {
    value = null;
  } else {
    value = allowNull ? null : '';
  }
  return coerceSeoFieldAroundValue(obj || {}, value);
}

function coerceStringArrayField(raw: unknown): AnyRec {
  const field = coerceSecondaryField(raw, []);
  const value = Array.isArray(field.value)
    ? field.value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
  field.value = value;
  return field;
}

function coerceJsonLdField(raw: unknown): AnyRec {
  const fallback = { '@context': 'https://schema.org', '@graph': [] as unknown[] };
  const field = coerceSecondaryField(raw, fallback);
  const v = asRec(field.value);
  if (!v) {
    field.value = fallback;
    return field;
  }
  const graph = Array.isArray(v['@graph']) ? v['@graph'] : [];
  field.value = {
    '@context': typeof v['@context'] === 'string' ? v['@context'] : 'https://schema.org',
    '@graph': graph,
  };
  return field;
}

function coerceInternalLinks(raw: unknown): AnyRec {
  const field = coerceSecondaryField(raw, []);
  const value = Array.isArray(field.value) ? field.value : [];
  field.value = value
    .map((item) => {
      const o = asRec(item);
      if (!o) return null;
      const anchorText = typeof o.anchorText === 'string' ? o.anchorText.trim() : '';
      const rationale = typeof o.rationale === 'string' ? o.rationale.trim() : '';
      if (!anchorText || !rationale) return null;
      return {
        ...(typeof o.targetArticleKey === 'string' ? { targetArticleKey: o.targetArticleKey } : {}),
        ...(typeof o.url === 'string' ? { url: o.url } : {}),
        anchorText,
        rationale,
      };
    })
    .filter(Boolean);
  return field;
}

function coerceExternalLinks(raw: unknown): AnyRec {
  const field = coerceSecondaryField(raw, []);
  const value = Array.isArray(field.value) ? field.value : [];
  field.value = value
    .map((item) => {
      const o = asRec(item);
      if (!o) return null;
      const url = typeof o.url === 'string' ? o.url.trim() : '';
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!url || !label) return null;
      return { url, label };
    })
    .filter(Boolean);
  return field;
}

function coerceChecklist(raw: unknown): AnyRec {
  const field = coerceSecondaryField(raw, []);
  const value = Array.isArray(field.value) ? field.value : [];
  field.value = value
    .map((item) => {
      const o = asRec(item);
      if (!o) return null;
      if (typeof o.id !== 'string' || typeof o.label !== 'string') return null;
      if (typeof o.done !== 'boolean') return null;
      if (o.severity !== 'info' && o.severity !== 'warn' && o.severity !== 'block') return null;
      return { id: o.id, label: o.label, done: o.done, severity: o.severity };
    })
    .filter(Boolean);
  return field;
}

function coerceRisks(raw: unknown): AnyRec {
  const field = coerceSecondaryField(raw, []);
  const value = Array.isArray(field.value) ? field.value : [];
  field.value = value
    .map((item) => {
      const o = asRec(item);
      if (!o) return null;
      if (typeof o.code !== 'string' || typeof o.message !== 'string') return null;
      if (o.severity !== 'warn' && o.severity !== 'block') return null;
      return { code: o.code, message: o.message, severity: o.severity };
    })
    .filter(Boolean);
  return field;
}

function requireCoreTextField(
  fieldsIn: AnyRec,
  key: (typeof CORE_TEXT_FIELDS)[number],
  label: string
): AnyRec {
  const core = readCoreTextValue(fieldsIn[key]);
  if (!core) {
    throw new StrategyCoerceError(
      `Fail closed: ${label} missing non-empty ${key} (coercion must not invent core SEO text)`
    );
  }
  return coerceSeoFieldAroundValue(fieldsIn[key], core);
}

function coerceDirection(raw: unknown, label: string): AnyRec {
  const d = asRec(raw);
  if (!d) {
    throw new StrategyCoerceError(`Fail closed: ${label} is missing or not an object`);
  }
  const fieldsIn = asRec(d.fields);
  if (!fieldsIn) {
    throw new StrategyCoerceError(`Fail closed: ${label}.fields is missing`);
  }

  const fields: AnyRec = {
    seoTitle: requireCoreTextField(fieldsIn, 'seoTitle', label),
    metaDescription: requireCoreTextField(fieldsIn, 'metaDescription', label),
  };

  for (const [key, fallback] of Object.entries(SECONDARY_FALLBACKS)) {
    if (key === 'internalLinks') {
      fields[key] = coerceInternalLinks(fieldsIn[key]);
    } else if (key === 'externalLinks') {
      fields[key] = coerceExternalLinks(fieldsIn[key]);
    } else if (key === 'checklist') {
      fields[key] = coerceChecklist(fieldsIn[key]);
    } else if (key === 'risks') {
      fields[key] = coerceRisks(fieldsIn[key]);
    } else if (key === 'imageCaption') {
      fields[key] = coerceStringOrNullField(fieldsIn[key], true);
    } else if (key === 'supportingTopics' || key === 'tags') {
      fields[key] = coerceStringArrayField(fieldsIn[key]);
    } else if (key === 'jsonLd') {
      fields[key] = coerceJsonLdField(fieldsIn[key]);
    } else if (
      key === 'slug' ||
      key === 'canonical' ||
      key === 'ogTitle' ||
      key === 'ogDescription' ||
      key === 'primaryPhrase' ||
      key === 'section' ||
      key === 'imageAlt'
    ) {
      fields[key] = coerceStringOrNullField(fieldsIn[key], false);
    } else {
      fields[key] = coerceSecondaryField(fieldsIn[key], fallback);
    }
  }

  // Keep AI ogTitle/ogDescription in sync with core when omitted
  const seoTitle = String((fields.seoTitle as AnyRec).value);
  const meta = String((fields.metaDescription as AnyRec).value);
  const ogTitle = fields.ogTitle as AnyRec;
  const ogDesc = fields.ogDescription as AnyRec;
  if (!String(ogTitle.value || '').trim()) {
    fields.ogTitle = coerceSeoFieldAroundValue(ogTitle, seoTitle);
  }
  if (!String(ogDesc.value || '').trim()) {
    fields.ogDescription = coerceSeoFieldAroundValue(ogDesc, meta);
  }

  const family =
    typeof d.family === 'string' && VALID_FAMILIES.has(d.family) ? d.family : null;
  if (!family) {
    throw new StrategyCoerceError(`Fail closed: ${label}.family is missing or invalid`);
  }

  return {
    id: typeof d.id === 'string' && d.id.trim() ? d.id.trim() : null,
    family,
    intentPriority: typeof d.intentPriority === 'string' ? d.intentPriority : '',
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
 * Fill missing secondary wrappers only. Never invents core SEO title/meta.
 * Throws StrategyCoerceError when recommended or either alternative lacks core fields.
 */
export function coerceStrategyPackAiOutput(raw: unknown): unknown {
  const root = asRec(raw);
  if (!root) {
    throw new StrategyCoerceError('Fail closed: strategy pack root is not an object');
  }

  const recommended = coerceDirection(root.recommended, 'recommended');
  if (!recommended.id) {
    recommended.id = 'recommended';
  }

  const altsIn = Array.isArray(root.alternatives) ? root.alternatives : null;
  if (!altsIn || altsIn.length < 2) {
    throw new StrategyCoerceError(
      'Fail closed: alternatives must include 2 real strategies (will not invent empty alts)'
    );
  }

  const alternatives = [0, 1].map((i) => {
    const alt = coerceDirection(altsIn[i], `alternatives[${i}]`);
    if (!alt.id) alt.id = `alternative-${i + 1}`;
    return alt;
  });

  const pub = asRec(root.cmsPublishability);
  const publishability =
    pub &&
    pub.seoTitle === 'cms_writable' &&
    pub.metaDescription === 'cms_writable'
      ? pub
      : getCmsPublishability();

  return {
    schemaVersion:
      typeof root.schemaVersion === 'string' && root.schemaVersion.trim()
        ? root.schemaVersion
        : SEO_ENGINE_SCHEMA_VERSION,
    recommendedStrategyId:
      typeof root.recommendedStrategyId === 'string' && root.recommendedStrategyId.trim()
        ? root.recommendedStrategyId.trim()
        : String(recommended.id),
    recommended,
    alternatives,
    cmsPublishability: publishability,
  };
}
