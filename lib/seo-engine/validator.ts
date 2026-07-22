import { findForbiddenPhrases } from '@/lib/seo-engine/forbidden-phrases';
import type { EditorialAnalysisV1, SeoStrategyPackV1 } from '@/lib/seo-engine/schema';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '@/lib/seo/constants';

export type ValidationIssue = {
  code: string;
  message: string;
  fieldPath?: string;
};

export type ValidationResult = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  suggestions: ValidationIssue[];
};

function checkTextField(
  fieldPath: string,
  value: string,
  opts: { max?: number; requireEntity?: string }
): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const forbidden = findForbiddenPhrases(value);
  for (const p of forbidden) {
    errors.push({
      code: 'forbidden_phrase',
      message: `Forbudt frase: "${p}"`,
      fieldPath,
    });
  }
  if (opts.max && value.length > opts.max) {
    warnings.push({
      code: 'length_heuristic',
      message: `${fieldPath} er ${value.length} tegn (heuristik max ${opts.max})`,
      fieldPath,
    });
  }
  if (opts.requireEntity && opts.requireEntity.trim()) {
    const ent = opts.requireEntity.trim().toLowerCase();
    if (ent.length >= 3 && !value.toLowerCase().includes(ent)) {
      warnings.push({
        code: 'missing_primary_entity',
        message: `Primær entitet "${opts.requireEntity}" fremgår ikke tydeligt`,
        fieldPath,
      });
    }
  }
  // crude stuffing: same 4+ letter token ≥ 4 times
  const tokens = value.toLowerCase().match(/[a-zæøå]{4,}/g) || [];
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  for (const [t, n] of counts) {
    if (n >= 4) {
      warnings.push({
        code: 'keyword_stuffing',
        message: `Gentaget token "${t}" ${n} gange`,
        fieldPath,
      });
      break;
    }
  }
  return { errors, warnings };
}

export function validateSeoPack(
  pack: SeoStrategyPackV1,
  analysis: EditorialAnalysisV1
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suggestions: ValidationIssue[] = [];

  const entity = analysis.primaryEntity.asWritten;
  const fields = pack.recommended.fields;

  for (const [path, max] of [
    ['seoTitle', SEO_TITLE_MAX],
    ['metaDescription', SEO_DESCRIPTION_MAX],
  ] as const) {
    const field = fields[path];
    const r = checkTextField(path, field.value, { max, requireEntity: entity });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }

  if (!entity.trim()) {
    errors.push({ code: 'no_primary_entity', message: 'Primær entitet mangler' });
  }

  if (analysis.spoilerSensitive) {
    const meta = fields.metaDescription.value.toLowerCase();
    if (/\b(dør|spoiler|ending|finale|afslører)\b/i.test(meta)) {
      errors.push({
        code: 'spoiler_in_meta',
        message: 'Meta description kan afsløre spoilers',
        fieldPath: 'metaDescription',
      });
    }
  }

  const slug = fields.slug.value;
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.push({ code: 'invalid_slug', message: 'Ugyldigt slug-format', fieldPath: 'slug' });
  }

  const graph = fields.jsonLd.value['@graph'] || [];
  if (graph.length === 0) {
    warnings.push({ code: 'empty_jsonld', message: 'JSON-LD @graph er tom', fieldPath: 'jsonLd' });
  }

  if (analysis.facts.missing.length > 0) {
    suggestions.push({
      code: 'check_missing_facts',
      message: `Kontrollér: ${analysis.facts.missing.slice(0, 5).join('; ')}`,
    });
  }

  return { errors, warnings, suggestions };
}
