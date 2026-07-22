import type {
  PublishFields,
  SeoField,
  SeoStrategyPackV1,
  StrategyDirection,
} from '@/lib/seo-engine/schema';

const LOCKABLE_SEO_PATHS = ['seoTitle', 'metaDescription'] as const;

function applyLockedSeoFromSource(
  target: StrategyDirection,
  lockSource: StrategyDirection
): StrategyDirection {
  const fields = { ...target.fields } as PublishFields;
  for (const path of LOCKABLE_SEO_PATHS) {
    const src = lockSource.fields[path] as SeoField<string>;
    if (!src?.locked) continue;
    fields[path] = {
      ...src,
      locked: true,
      warnings: [...new Set([...(src.warnings || []), 'locked_existing_cms'])],
    };
  }
  return { ...target, fields };
}

/** Copy locked SEO title/meta from a source direction onto every direction in the pack. */
export function preserveLockedSeoAcrossPack(
  pack: SeoStrategyPackV1,
  lockSource: StrategyDirection
): SeoStrategyPackV1 {
  const next = structuredClone(pack);
  next.recommended = applyLockedSeoFromSource(next.recommended, lockSource);
  next.alternatives = next.alternatives.map((alt) =>
    applyLockedSeoFromSource(alt, lockSource)
  ) as SeoStrategyPackV1['alternatives'];
  return next;
}

/**
 * Promote an alternative (by id) to recommended.
 * Lookup is server-side only among `alternatives` — never trusts client strategy metadata.
 * Locked seoTitle/metaDescription from the previous recommended are forced onto all directions.
 */
export function adoptAlternativeInPack(
  pack: SeoStrategyPackV1,
  adoptStrategyId: string
): SeoStrategyPackV1 {
  const id = String(adoptStrategyId || '').trim();
  if (!id) {
    throw Object.assign(new Error('adoptStrategyId mangler'), { code: 'invalid_adopt' });
  }
  if (pack.recommended.id === id) {
    throw Object.assign(new Error('adoptStrategyId er allerede recommended'), {
      code: 'invalid_adopt',
    });
  }
  const idx = pack.alternatives.findIndex((a) => a.id === id);
  if (idx < 0) {
    throw Object.assign(new Error('adoptStrategyId findes ikke blandt alternatives'), {
      code: 'invalid_adopt',
    });
  }

  const previousRecommended = structuredClone(pack.recommended);
  const adopted = structuredClone(pack.alternatives[idx]!);
  const remaining = pack.alternatives.filter((_, i) => i !== idx);
  const nextAlternatives = [previousRecommended, ...remaining].slice(
    0,
    2
  ) as SeoStrategyPackV1['alternatives'];

  const promoted: SeoStrategyPackV1 = {
    ...structuredClone(pack),
    recommendedStrategyId: adopted.id,
    recommended: adopted,
    alternatives: nextAlternatives,
  };

  return preserveLockedSeoAcrossPack(promoted, previousRecommended);
}
