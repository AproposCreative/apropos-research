import { randomUUID } from 'node:crypto';
import {
  SeoEngineInputContractSchema,
  type EditorialAnalysisV1,
  type SeoEngineInputContract,
  type SeoStrategyPackV1,
} from '@/lib/seo-engine/schema';
import { computeInputVersionHash } from '@/lib/seo-engine/hash';
import { buildNormalizedInputText } from '@/lib/seo-engine/long-article';
import { buildDemoAnalysis, buildDemoStrategyPack } from '@/lib/seo-engine/demo-pipeline';
import { validateSeoPack } from '@/lib/seo-engine/validator';
import {
  applyEvidenceConfidencePenalty,
  verifyEvidenceAgainstSnapshot,
} from '@/lib/seo-engine/evidence';
import { applyDeterministicJsonLdToPack } from '@/lib/seo-engine/jsonld-apply';
import { assertSnapshotWithinBudget } from '@/lib/seo-engine/snapshot-budget';
import { assertEphemeralDemoEnv } from '@/lib/seo-engine/ephemeral-demo';
import { SEO_ENGINE_MIN_BODY_CHARS } from '@/lib/seo-engine/versions';
import { toConfidenceBand } from '@/lib/seo-engine/confidence';

export type EphemeralDemoResult = {
  ephemeral: true;
  mode: 'demo';
  analysisRunId: string;
  seoVersionId: string;
  articleKey: string;
  inputVersionHash: string;
  inputMode: 'full' | 'long_article_extract';
  analysis: EditorialAnalysisV1;
  pack: SeoStrategyPackV1;
  validation: ReturnType<typeof validateSeoPack>;
  confidenceBand: ReturnType<typeof toConfidenceBand>;
  persistDisabled: true;
  publishDisabled: true;
  historyDisabled: true;
  demoNotice: string;
};

/**
 * In-memory analyze+strategize for local/non-prod demo without Firebase/OpenAI.
 * Does not persist or publish.
 */
export function runEphemeralDemoPipeline(rawInput: unknown): EphemeralDemoResult {
  assertEphemeralDemoEnv();
  const parsed = SeoEngineInputContractSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw Object.assign(new Error('Ugyldigt input'), {
      code: 'invalid_input',
      details: parsed.error.flatten(),
    });
  }
  const input: SeoEngineInputContract = parsed.data;
  if ((input.body || '').trim().length < SEO_ENGINE_MIN_BODY_CHARS) {
    throw Object.assign(new Error(`Brødtekst skal være mindst ${SEO_ENGINE_MIN_BODY_CHARS} tegn`), {
      code: 'invalid_input',
    });
  }

  const inputVersionHash = computeInputVersionHash(input);
  const { normalizedText, inputMode } = buildNormalizedInputText(input);
  assertSnapshotWithinBudget({ contract: input, normalizedText });

  let analysis = buildDemoAnalysis({
    input,
    normalizedText,
    inputVersionHash,
    inputMode,
  });
  const verified = verifyEvidenceAgainstSnapshot({
    analysis,
    normalizedText,
    inputVersionHash,
  });
  analysis = applyEvidenceConfidencePenalty(verified.analysis, verified.invalidEvidenceCount);

  let pack = buildDemoStrategyPack({ input, analysis });
  pack = applyDeterministicJsonLdToPack(pack, input, analysis);
  const validation = validateSeoPack(pack, analysis);

  const band = toConfidenceBand({
    raw: analysis.primaryEntity.confidence,
    evidenceCount: analysis.primaryEntity.evidence.length,
    hasConflict: analysis.articleType.conflict,
    missingFactCount: analysis.facts.missing.length,
    inputMode,
  });

  return {
    ephemeral: true,
    mode: 'demo',
    analysisRunId: `ephemeral-run-${randomUUID()}`,
    seoVersionId: `ephemeral-ver-${randomUUID()}`,
    articleKey: `draft:${inputVersionHash}`,
    inputVersionHash,
    inputMode,
    analysis,
    pack,
    validation,
    confidenceBand: band,
    persistDisabled: true,
    publishDisabled: true,
    historyDisabled: true,
    demoNotice:
      'Ephemeral lokal demo — ingen Firebase/OpenAI, ingen persistens, gem/historik/auto-publish utilgængeligt',
  };
}
