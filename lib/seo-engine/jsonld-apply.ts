import type {
  EditorialAnalysisV1,
  SeoEngineInputContract,
  SeoStrategyPackV1,
  StrategyDirection,
} from '@/lib/seo-engine/schema';
import { buildJsonLd } from '@/lib/seo-engine/jsonld';
import { getCmsPublishability } from '@/lib/seo-engine/webflow-adapter';

function applyJsonLdToDirection(
  direction: StrategyDirection,
  input: SeoEngineInputContract,
  analysis: EditorialAnalysisV1
): StrategyDirection {
  const seoTitle = direction.fields.seoTitle.value;
  const metaDescription = direction.fields.metaDescription.value;
  const jsonLd = buildJsonLd({ input, analysis, seoTitle, metaDescription });
  return {
    ...direction,
    fields: {
      ...direction.fields,
      jsonLd: {
        ...direction.fields.jsonLd,
        value: jsonLd,
        rationale: 'Deterministisk server-JSON-LD',
        sources: ['inference', 'article'],
        warnings: [
          ...new Set([...(direction.fields.jsonLd.warnings || []), 'server_jsonld']),
        ],
      },
    },
  };
}

/** Always overwrite AI/demo jsonLd with deterministic server builder for all directions. */
export function applyDeterministicJsonLdToPack(
  pack: SeoStrategyPackV1,
  input: SeoEngineInputContract,
  analysis: EditorialAnalysisV1
): SeoStrategyPackV1 {
  return {
    ...pack,
    cmsPublishability: getCmsPublishability(),
    recommended: applyJsonLdToDirection(pack.recommended, input, analysis),
    alternatives: pack.alternatives.map((alt) =>
      applyJsonLdToDirection(alt, input, analysis)
    ) as SeoStrategyPackV1['alternatives'],
  };
}
