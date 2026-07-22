import { randomUUID } from 'node:crypto';
import { getOpenAIClient, models } from '@/lib/openai';
import {
  EditorialAnalysisV1Schema,
  SeoEngineInputContractSchema,
  SeoStrategyPackV1Schema,
  AllowlistedFieldPathSchema,
  type AllowlistedFieldPath,
  type EditorialAnalysisV1,
  type SeoEngineInputContract,
  type SeoStrategyPackV1,
  type SeoField,
  type PublishFields,
  type StrategyDirection,
} from '@/lib/seo-engine/schema';
import { computeInputVersionHash } from '@/lib/seo-engine/hash';
import { buildNormalizedInputText } from '@/lib/seo-engine/long-article';
import { buildDemoAnalysis, buildDemoStrategyPack } from '@/lib/seo-engine/demo-pipeline';
import { adoptAlternativeInPack } from '@/lib/seo-engine/adopt';
import { validateSeoPack, type ValidationResult } from '@/lib/seo-engine/validator';
import { parseFieldValue } from '@/lib/seo-engine/field-paths';
import {
  applyFieldPatchesInTransaction,
  getAnalysisRun,
  getInputSnapshot,
  getSeoVersion,
  markSeoVersionStale,
  saveAnalysisRun,
  saveSeoVersion,
  upsertInputSnapshot,
  versionStamps,
  markAnalysisStrategyFailure,
} from '@/lib/seo-engine/store';
import { SEO_ENGINE_MIN_BODY_CHARS, SEO_ENGINE_SCHEMA_VERSION } from '@/lib/seo-engine/versions';
import {
  buildAnalyzeSystemPrompt,
  buildRegenerateSystemPrompt,
  buildStrategizeSystemPrompt,
  loadEditorialAnalysisJsonSchema,
  loadSeoStrategyPackJsonSchema,
} from '@/lib/seo-engine/prompts';
import {
  getSearchSignalsProvider,
  toAnalyzePromptSearchSignals,
  type SearchSignalsProvenance,
} from '@/lib/seo-engine/search-signals';
import { resolveEffectiveArticleType } from '@/lib/seo-engine/review-title-rule';
import {
  applyEvidenceConfidencePenalty,
  verifyEvidenceAgainstSnapshot,
} from '@/lib/seo-engine/evidence';
import {
  openaiMaxTokens,
  openaiTimeoutMs,
  resolveStableArticleKey,
  safeAiDebug,
} from '@/lib/seo-engine/access';
import { applyDeterministicJsonLdToPack } from '@/lib/seo-engine/jsonld-apply';
import { assertSnapshotWithinBudget } from '@/lib/seo-engine/snapshot-budget';
import { coerceStrategyPackAiOutput, StrategyCoerceError } from '@/lib/seo-engine/coerce-strategy';

function demoEnabled(): boolean {
  return process.env.SEO_ENGINE_DEMO === 'true';
}

/** Parse model JSON; strip optional markdown fences. */
export function parseAiJsonContent(raw: string): unknown {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    throw Object.assign(new Error('Strategy AI returnerede tomt svar'), {
      code: 'ai_parse_error',
    });
  }
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    // Attempt to salvage leading/trailing junk around a JSON object
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw Object.assign(new Error('Strategy AI returnerede ugyldig JSON'), {
      code: 'ai_parse_error',
    });
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error(`${label} timeout after ${ms}ms`), { code: 'ai_timeout' })),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function setPublishField(
  fields: PublishFields,
  path: AllowlistedFieldPath,
  next: SeoField<unknown>
): void {
  (fields as Record<string, SeoField<unknown>>)[path] = next;
}

function lockDirectionExistingSeo(
  direction: StrategyDirection,
  input: SeoEngineInputContract
): StrategyDirection {
  const fields = { ...direction.fields };
  if (input.existingSeoTitle?.trim()) {
    fields.seoTitle = {
      ...fields.seoTitle,
      value: input.existingSeoTitle.trim(),
      locked: true,
      sources: ['editor_metadata'],
      warnings: [
        ...new Set([...(fields.seoTitle.warnings || []), 'locked_existing_cms']),
      ],
    };
  }
  if (input.existingMetaDescription?.trim()) {
    fields.metaDescription = {
      ...fields.metaDescription,
      value: input.existingMetaDescription.trim(),
      locked: true,
      sources: ['editor_metadata'],
      warnings: [
        ...new Set([...(fields.metaDescription.warnings || []), 'locked_existing_cms']),
      ],
    };
  }
  return { ...direction, fields };
}

/** Lock existing CMS SEO title/meta on recommended AND all alternatives (adoption-safe). */
function lockExistingSeoFields(
  pack: SeoStrategyPackV1,
  input: SeoEngineInputContract
): SeoStrategyPackV1 {
  const next = structuredClone(pack);
  next.recommended = lockDirectionExistingSeo(next.recommended, input);
  next.alternatives = next.alternatives.map((alt) =>
    lockDirectionExistingSeo(alt, input)
  ) as SeoStrategyPackV1['alternatives'];
  return next;
}

function finalizeStrategyPack(
  pack: SeoStrategyPackV1,
  input: SeoEngineInputContract,
  analysis: EditorialAnalysisV1
): { pack: SeoStrategyPackV1; validation: ValidationResult } {
  let next = lockExistingSeoFields(pack, input);
  next = applyDeterministicJsonLdToPack(next, input, analysis);
  // Enforce exactly 2 alternatives at finalize (pad/truncate only after Zod for AI)
  if (next.alternatives.length !== 2) {
    const demo = buildDemoStrategyPack({ input, analysis });
    while (next.alternatives.length < 2) {
      const filler = demo.alternatives[next.alternatives.length];
      if (!filler) break;
      next.alternatives.push(filler);
    }
    next.alternatives = next.alternatives.slice(0, 2) as SeoStrategyPackV1['alternatives'];
    next = applyDeterministicJsonLdToPack(next, input, analysis);
  }
  const validation = validateSeoPack(next, analysis, { language: input.language });
  return { pack: next, validation };
}

export type AnalyzeResult = {
  analysisRunId: string;
  inputVersionHash: string;
  inputMode: 'full' | 'long_article_extract';
  mode: 'ai' | 'demo';
  analysis: EditorialAnalysisV1;
  articleKey: string;
  evidenceIssues?: number;
  searchSignalsProvenance?: SearchSignalsProvenance;
};

export async function analyzeArticle(
  rawInput: unknown,
  opts: {
    userId: string;
    forceDemo?: boolean;
    articleKey?: string | null;
    webflowItemId?: string | null;
  }
): Promise<AnalyzeResult> {
  const parsed = SeoEngineInputContractSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw Object.assign(new Error('Ugyldigt input'), {
      code: 'invalid_input',
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;
  if ((input.body || '').trim().length < SEO_ENGINE_MIN_BODY_CHARS) {
    throw Object.assign(new Error(`Brødtekst skal være mindst ${SEO_ENGINE_MIN_BODY_CHARS} tegn`), {
      code: 'invalid_input',
    });
  }

  const inputVersionHash = computeInputVersionHash(input);
  const { normalizedText, inputMode, extractManifest } = buildNormalizedInputText(input);
  const articleKey = resolveStableArticleKey({
    articleKey: opts.articleKey,
    webflowItemId: opts.webflowItemId,
    inputVersionHash,
  });

  const byteSize = assertSnapshotWithinBudget({ contract: input, normalizedText });

  await upsertInputSnapshot({
    inputVersionHash,
    contract: input,
    normalizedText,
    inputMode,
    extractManifest: extractManifest as Record<string, unknown> | undefined,
    byteSize,
  });

  const openaiMissing = !getOpenAIClient();
  const useDemo = Boolean(opts.forceDemo || demoEnabled());
  if (openaiMissing && !useDemo && process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('OpenAI er ikke konfigureret'), { code: 'fail_closed' });
  }
  // Fail closed in prod when neither demo nor OpenAI
  if (openaiMissing && !useDemo) {
    throw Object.assign(new Error('OpenAI mangler — sæt SEO_ENGINE_DEMO=true for lokal demo'), {
      code: 'fail_closed',
    });
  }

  const analysisRunId = randomUUID();
  let analysis: EditorialAnalysisV1;
  let mode: 'ai' | 'demo' = 'demo';
  let provider: string | undefined;
  let model: string | undefined;
  let evidenceIssues = 0;
  let searchSignalsProvenance: SearchSignalsProvenance | undefined;

  try {
    // Optional live GA4/GSC signals — never override entity/stance; fail soft.
    let searchSignalsForPrompt: ReturnType<typeof toAnalyzePromptSearchSignals> | null = null;
    try {
      const bundle = await getSearchSignalsProvider().getSignals({
        seeds: [input.editorialTitle, input.subtitle || '', input.articleType || ''].filter(
          Boolean
        ) as string[],
        language: input.language,
        articleType: input.articleType,
        limit: 12,
        days: 28,
      });
      searchSignalsProvenance = bundle.provenance;
      searchSignalsForPrompt = toAnalyzePromptSearchSignals(bundle);
    } catch {
      searchSignalsProvenance = {
        provider: 'null',
        period: { startDate: '28daysAgo', endDate: 'today' },
        retrievedAt: new Date().toISOString(),
        signalsAvailable: false,
        searchConsoleLinked: false,
        queryRowsAvailable: false,
        aggregateOnly: true,
        uiNote: 'ingen søgedata',
        errorCode: 'provider_exception',
      };
    }

    if (useDemo || openaiMissing) {
      analysis = buildDemoAnalysis({
        input,
        normalizedText,
        inputVersionHash,
        inputMode,
      });
      mode = 'demo';
    } else {
      const client = getOpenAIClient()!;
      model = models.default;
      provider = 'openai';
      const schema = loadEditorialAnalysisJsonSchema();
      const completion = await withTimeout(
        client.chat.completions.create({
          model,
          temperature: 0.2,
          max_completion_tokens: openaiMaxTokens(),
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'EditorialAnalysisV1',
              schema,
              strict: false,
            },
          },
          messages: [
            { role: 'system', content: buildAnalyzeSystemPrompt() },
            {
              role: 'user',
              content: JSON.stringify({
                schemaVersion: SEO_ENGINE_SCHEMA_VERSION,
                inputVersionHash,
                inputMode,
                // Explicit schema echo for models that ignore response_format details
                outputSchema: schema,
                contract: {
                  ...input,
                  body: normalizedText,
                },
                searchSignals: searchSignalsForPrompt,
                searchSignalsRules: {
                  optional: true,
                  doNotInventVolumes: true,
                  doNotOverrideEntityOrStance: true,
                  reviewTitleRuleStillApplies: true,
                  ifUnavailableUseHeuristicOnly: true,
                },
              }),
            },
          ],
        }),
        openaiTimeoutMs(),
        'analyze'
      );
      const raw = completion.choices[0]?.message?.content || '{}';
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw Object.assign(new Error('AI returnerede ugyldig JSON'), { code: 'ai_parse_error' });
      }
      const z = EditorialAnalysisV1Schema.safeParse(json);
      if (!z.success) {
        throw Object.assign(new Error('AI-analyse fejlede Zod-validering'), {
          code: 'ai_schema_error',
          details: z.error.flatten(),
        });
      }
      const verified = verifyEvidenceAgainstSnapshot({
        analysis: z.data,
        normalizedText,
        inputVersionHash,
      });
      evidenceIssues = verified.invalidEvidenceCount;
      analysis = applyEvidenceConfidencePenalty(verified.analysis, verified.invalidEvidenceCount);
      mode = 'ai';
    }

    // Always verify demo evidence too (should pass)
    if (mode === 'demo') {
      const verified = verifyEvidenceAgainstSnapshot({
        analysis,
        normalizedText,
        inputVersionHash,
      });
      evidenceIssues = verified.invalidEvidenceCount;
      analysis = applyEvidenceConfidencePenalty(verified.analysis, verified.invalidEvidenceCount);
    }

    // Ensure review-type awareness is retained in analysis metadata path
    void resolveEffectiveArticleType(analysis, input.articleType);

    await saveAnalysisRun({
      id: analysisRunId,
      articleKey,
      inputVersionHash,
      snapshotPath: `seoEngineInputSnapshots/${inputVersionHash}`,
      inputMode,
      status: 'succeeded',
      mode,
      analysis,
      provider,
      model,
      createdBy: opts.userId,
      debug: {
        ...(evidenceIssues ? { evidenceIssues } : {}),
        ...(searchSignalsProvenance
          ? {
              searchSignals: {
                provider: searchSignalsProvenance.provider,
                period: searchSignalsProvenance.period,
                retrievedAt: searchSignalsProvenance.retrievedAt,
                signalsAvailable: searchSignalsProvenance.signalsAvailable,
                searchConsoleLinked: searchSignalsProvenance.searchConsoleLinked,
                queryRowsAvailable: searchSignalsProvenance.queryRowsAvailable,
                aggregateOnly: searchSignalsProvenance.aggregateOnly,
                uiNote: searchSignalsProvenance.uiNote,
                setupStatus: searchSignalsProvenance.setupStatus,
                errorCode: searchSignalsProvenance.errorCode,
              },
            }
          : {}),
      },
      ...versionStamps(),
    });

    return {
      analysisRunId,
      inputVersionHash,
      inputMode,
      mode,
      analysis,
      articleKey,
      evidenceIssues,
      searchSignalsProvenance,
    };
  } catch (e) {
    const debug = safeAiDebug(e);
    await saveAnalysisRun({
      id: analysisRunId,
      articleKey,
      inputVersionHash,
      snapshotPath: `seoEngineInputSnapshots/${inputVersionHash}`,
      inputMode,
      status: 'failed',
      mode: useDemo ? 'demo' : 'ai',
      provider,
      model,
      createdBy: opts.userId,
      error: debug.message,
      debug,
      ...versionStamps(),
    }).catch(() => undefined);
    throw e;
  }
}

export type StrategizeResult = {
  seoVersionId: string;
  revision: number;
  pack: SeoStrategyPackV1;
  validation: ValidationResult;
  stale: boolean;
  mode: 'ai' | 'demo';
};

export async function strategizeFromRun(
  analysisRunId: string,
  opts: {
    userId: string;
    currentInput?: SeoEngineInputContract;
    forceDemo?: boolean;
  }
): Promise<StrategizeResult> {
  const run = await getAnalysisRun(analysisRunId);
  if (!run) {
    throw Object.assign(new Error('analysisRun findes ikke'), { code: 'not_found' });
  }
  if (run.status === 'failed' || !run.analysis) {
    throw Object.assign(new Error('analysisRun er failed eller mangler analysis'), {
      code: 'analysis_failed',
    });
  }

  const snapshot = await getInputSnapshot(run.inputVersionHash);
  if (!snapshot) {
    throw Object.assign(new Error('Input snapshot mangler'), { code: 'snapshot_missing' });
  }

  const current = opts.currentInput || snapshot.contract;
  const currentHash = computeInputVersionHash(current);
  if (currentHash !== run.inputVersionHash) {
    throw Object.assign(new Error('Artiklen er ændret siden analysen'), {
      code: 'stale_input',
      expected: run.inputVersionHash,
      actual: currentHash,
    });
  }

  const useDemo = Boolean(opts.forceDemo || demoEnabled() || run.mode === 'demo');
  const openaiMissing = !getOpenAIClient();
  if (!useDemo && openaiMissing) {
    throw Object.assign(new Error('OpenAI mangler til Fase B'), { code: 'fail_closed' });
  }
  // Never silently demote an AI analysis run to demo strategy in prod
  if (run.mode === 'ai' && (opts.forceDemo || demoEnabled()) && process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('Kan ikke køre demo-strategi på AI-run i production'), {
      code: 'fail_closed',
    });
  }

  let pack: SeoStrategyPackV1;
  let mode: 'ai' | 'demo' = useDemo ? 'demo' : 'ai';

  try {
    if (useDemo) {
      pack = buildDemoStrategyPack({ input: current, analysis: run.analysis });
      mode = 'demo';
    } else {
      const client = getOpenAIClient()!;
      const schema = loadSeoStrategyPackJsonSchema();
      const completion = await withTimeout(
        client.chat.completions.create({
          model: models.default,
          temperature: 0.3,
          max_completion_tokens: openaiMaxTokens(),
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'SeoStrategyPackV1',
              schema,
              strict: false,
            },
          },
          messages: [
            { role: 'system', content: buildStrategizeSystemPrompt() },
            {
              role: 'user',
              content: JSON.stringify({
                schemaVersion: SEO_ENGINE_SCHEMA_VERSION,
                inputVersionHash: run.inputVersionHash,
                lockedAnalysis: run.analysis,
                contract: {
                  editorialTitle: current.editorialTitle,
                  language: current.language,
                  existingSeoTitle: current.existingSeoTitle ?? null,
                  existingMetaDescription: current.existingMetaDescription ?? null,
                },
                requireAlternatives: 2,
              }),
            },
          ],
        }),
        openaiTimeoutMs(),
        'strategize'
      );
      const raw = completion.choices[0]?.message?.content || '';
      const json = parseAiJsonContent(raw);
      let coerced: unknown;
      try {
        coerced = coerceStrategyPackAiOutput(json);
      } catch (coerceErr) {
        if (coerceErr instanceof StrategyCoerceError) {
          throw Object.assign(new Error(coerceErr.message), {
            code: coerceErr.code,
          });
        }
        throw coerceErr;
      }
      const z = SeoStrategyPackV1Schema.safeParse(coerced);
      if (!z.success) {
        throw Object.assign(new Error('Strategy AI fejlede Zod-validering'), {
          code: 'ai_schema_error',
          details: z.error.flatten(),
        });
      }
      pack = z.data;
      mode = 'ai';
    }

    const finalized = finalizeStrategyPack(pack, current, run.analysis);
    pack = finalized.pack;
    const validation = finalized.validation;
    const seoVersionId = randomUUID();
    await saveSeoVersion({
      id: seoVersionId,
      analysisRunId,
      articleKey: run.articleKey,
      inputVersionHash: run.inputVersionHash,
      pack,
      validation,
      createdBy: opts.userId,
      mode,
      ...versionStamps(),
    });

    return {
      seoVersionId,
      revision: 1,
      pack,
      validation,
      stale: false,
      mode,
    };
  } catch (e) {
    const debug = safeAiDebug(e);
    await markAnalysisStrategyFailure(analysisRunId, {
      message: debug.message,
      code: debug.code,
      details: debug.details,
    }).catch(() => undefined);
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), {
      strategyFailure: debug,
    });
  }
}

export async function saveFields(args: {
  seoVersionId: string;
  expectedRevision: number;
  patches: Array<{ fieldPath: string; value: unknown; locked?: boolean }>;
  userId: string;
  currentInput?: SeoEngineInputContract;
  /** Server-validated: must match an existing alternative id on this version. */
  adoptStrategyId?: string;
}): Promise<{ revision: number; pack: SeoStrategyPackV1 }> {
  const version = await getSeoVersion(args.seoVersionId);
  if (!version) {
    throw Object.assign(new Error('seoVersion findes ikke'), { code: 'not_found' });
  }

  const snapshot = await getInputSnapshot(version.inputVersionHash);
  if (!snapshot) {
    throw Object.assign(new Error('snapshot mangler'), { code: 'snapshot_missing' });
  }
  const current = args.currentInput || snapshot.contract;
  if (computeInputVersionHash(current) !== version.inputVersionHash) {
    await markSeoVersionStale(args.seoVersionId);
    throw Object.assign(new Error('Artiklen er ændret — resultatet er stale'), {
      code: 'stale_input',
    });
  }

  let pack: SeoStrategyPackV1 = structuredClone(version.pack);
  const revisionLogs: Array<{
    fieldPath: string;
    previousValue: unknown;
    newValue: unknown;
    source: 'editor';
    userId: string;
  }> = [];

  const adoptId = args.adoptStrategyId?.trim();
  if (adoptId) {
    const previousId = pack.recommendedStrategyId;
    pack = adoptAlternativeInPack(pack, adoptId);
    // Re-apply CMS locks from input so adoption cannot bypass locked SEO
    pack = lockExistingSeoFields(pack, current);
    revisionLogs.push({
      fieldPath: 'recommendedStrategyId',
      previousValue: previousId,
      newValue: pack.recommendedStrategyId,
      source: 'editor',
      userId: args.userId,
    });
  }

  for (const patch of args.patches) {
    const parsed = parseFieldValue(patch.fieldPath, patch.value);
    if (parsed.ok === false) {
      throw Object.assign(new Error(parsed.error), { code: 'invalid_patch' });
    }
    const path = parsed.fieldPath;
    const prev = pack.recommended.fields[path] as SeoField<unknown>;
    if (prev.locked && parsed.value !== prev.value) {
      throw Object.assign(new Error('Feltet er låst'), { code: 'field_locked' });
    }
    const nextField: SeoField<unknown> = {
      ...prev,
      value: parsed.value,
      locked: typeof patch.locked === 'boolean' ? patch.locked : prev.locked,
      characterCount:
        typeof parsed.value === 'string' ? parsed.value.length : prev.characterCount,
    };
    setPublishField(pack.recommended.fields, path, nextField);
    revisionLogs.push({
      fieldPath: path,
      previousValue: prev.value,
      newValue: parsed.value,
      source: 'editor',
      userId: args.userId,
    });
  }

  if (!adoptId && args.patches.length === 0) {
    throw Object.assign(new Error('Ingen patches eller adoptStrategyId'), {
      code: 'invalid_input',
    });
  }

  const run = await getAnalysisRun(version.analysisRunId);
  const validation = run?.analysis
    ? validateSeoPack(pack, run.analysis, { language: current.language })
    : version.validation;

  try {
    const revision = await applyFieldPatchesInTransaction({
      seoVersionId: args.seoVersionId,
      expectedRevision: args.expectedRevision,
      pack,
      validation,
      revisionLogs,
    });
    return { revision, pack };
  } catch (e) {
    if (e instanceof Error && e.message === 'revision_conflict') {
      throw Object.assign(new Error('Konflikt: versionen er ændret'), {
        code: 'revision_conflict',
      });
    }
    throw e;
  }
}

export async function regenerateField(args: {
  seoVersionId: string;
  fieldPath: string;
  expectedRevision: number;
  editorInstruction?: string;
  userId: string;
  currentInput?: SeoEngineInputContract;
  forceDemo?: boolean;
}): Promise<{
  field: SeoField<unknown>;
  consequences: Array<{ code: string; message: string }>;
  revision: number;
}> {
  const pathParse = AllowlistedFieldPathSchema.safeParse(args.fieldPath);
  if (!pathParse.success) {
    throw Object.assign(new Error(`fieldPath ikke allowlistet: ${args.fieldPath}`), {
      code: 'invalid_field_path',
    });
  }
  const fieldPath = pathParse.data;

  const version = await getSeoVersion(args.seoVersionId);
  if (!version) {
    throw Object.assign(new Error('seoVersion findes ikke'), { code: 'not_found' });
  }

  const snapshot = await getInputSnapshot(version.inputVersionHash);
  if (!snapshot) {
    throw Object.assign(new Error('snapshot mangler'), { code: 'snapshot_missing' });
  }
  const current = args.currentInput || snapshot.contract;
  if (computeInputVersionHash(current) !== version.inputVersionHash) {
    await markSeoVersionStale(args.seoVersionId);
    throw Object.assign(new Error('Artiklen er ændret — resultatet er stale'), {
      code: 'stale_input',
    });
  }

  const existing = version.pack.recommended.fields[fieldPath] as SeoField<unknown>;
  if (existing.locked) {
    throw Object.assign(new Error('Feltet er låst'), { code: 'field_locked' });
  }

  const run = await getAnalysisRun(version.analysisRunId);
  if (!run?.analysis) {
    throw Object.assign(new Error('analysis mangler'), { code: 'not_found' });
  }

  const versionIsAi = version.mode === 'ai' || run.mode === 'ai';
  const explicitDemo = Boolean(args.forceDemo || demoEnabled());
  const openaiMissing = !getOpenAIClient();

  // Missing OpenAI must not silently demote an AI version to demo
  if (versionIsAi && openaiMissing && !explicitDemo) {
    throw Object.assign(new Error('OpenAI mangler til field regenerate'), { code: 'fail_closed' });
  }
  if (versionIsAi && explicitDemo && process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('Demo regenerate forbudt på AI-version i production'), {
      code: 'fail_closed',
    });
  }

  const useDemo = explicitDemo || version.mode === 'demo' || run.mode === 'demo';

  let newField: SeoField<unknown>;

  if (useDemo) {
    if (process.env.NODE_ENV === 'production' && !demoEnabled()) {
      throw Object.assign(new Error('Demo regenerate utilgængelig'), { code: 'fail_closed' });
    }
    const rebuilt = buildDemoStrategyPack({ input: current, analysis: run.analysis });
    // Prefer alternative pack field when instruction hints angle/evergreen — still clean value
    const alt =
      args.editorInstruction && /evergreen/i.test(args.editorInstruction)
        ? rebuilt.alternatives.find((a) => a.family === 'evergreen_first')
        : args.editorInstruction && /vinkel|angle/i.test(args.editorInstruction)
          ? rebuilt.alternatives.find((a) => a.family === 'angle_first')
          : null;
    const sourceFields = alt?.fields || rebuilt.recommended.fields;
    newField = {
      ...(sourceFields[fieldPath] as SeoField<unknown>),
      locked: false,
    };
    if (args.editorInstruction?.trim()) {
      const instr = args.editorInstruction.trim();
      // Never inject instruction text into publishable field values
      newField.rationale = `${newField.rationale} | Editorinstruktion respekteret i valg af variant`;
      newField.warnings = [...newField.warnings, 'editor_instruction_demo_rationale_only'];
      void instr;
    }
  } else {
    const client = getOpenAIClient()!;
    const lockedContext: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(version.pack.recommended.fields)) {
      lockedContext[k] = {
        value: (v as SeoField<unknown>).value,
        locked: (v as SeoField<unknown>).locked,
      };
    }
    const completion = await withTimeout(
      client.chat.completions.create({
        model: models.default,
        temperature: 0.4,
        max_completion_tokens: Math.min(1500, openaiMaxTokens()),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildRegenerateSystemPrompt() },
          {
            role: 'user',
            content: JSON.stringify({
              fieldPath,
              editorInstruction: args.editorInstruction || null,
              lockedAnalysis: run.analysis,
              currentFields: lockedContext,
              contractMeta: {
                editorialTitle: current.editorialTitle,
                language: current.language,
                articleType: current.articleType,
                existingSeoTitle: current.existingSeoTitle,
                existingMetaDescription: current.existingMetaDescription,
              },
            }),
          },
        ],
      }),
      openaiTimeoutMs(),
      'regenerate'
    );
    const raw = completion.choices[0]?.message?.content || '{}';
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('Regenerate AI returnerede ugyldig JSON'), {
        code: 'ai_parse_error',
      });
    }
    const obj = (json || {}) as {
      value?: unknown;
      rationale?: string;
      confidence?: number;
      warnings?: string[];
    };
    const valueCheck = parseFieldValue(fieldPath, obj.value);
    if (valueCheck.ok === false) {
      throw Object.assign(new Error(valueCheck.error), { code: 'invalid_patch' });
    }
    newField = {
      ...existing,
      value: valueCheck.value,
      rationale: String(obj.rationale || existing.rationale || 'Regenereret'),
      confidence:
        typeof obj.confidence === 'number'
          ? Math.max(0, Math.min(1, obj.confidence))
          : existing.confidence,
      warnings: Array.isArray(obj.warnings) ? obj.warnings.map(String) : [],
      locked: false,
      characterCount:
        typeof valueCheck.value === 'string' ? valueCheck.value.length : existing.characterCount,
      sources: existing.sources?.length ? existing.sources : ['inference', 'article'],
    };
  }

  const valueCheck = parseFieldValue(fieldPath, newField.value);
  if (valueCheck.ok === false) {
    throw Object.assign(new Error(valueCheck.error), { code: 'invalid_patch' });
  }
  newField = { ...newField, value: valueCheck.value };

  const pack = structuredClone(version.pack);
  setPublishField(pack.recommended.fields, fieldPath, newField);

  const consequences: Array<{ code: string; message: string }> = [];
  if (fieldPath === 'slug') {
    consequences.push({
      code: 'canonical_redirect',
      message: 'Slug-ændring kan kræve canonical/redirect — ændres ikke automatisk',
    });
  }
  if (fieldPath === 'seoTitle') {
    consequences.push({
      code: 'og_title_suggestion',
      message: 'Overvej at opdatere og godkende ogTitle manuelt',
    });
  }
  if (fieldPath === 'metaDescription') {
    consequences.push({
      code: 'og_description_suggestion',
      message: 'Overvej at opdatere og godkende ogDescription manuelt',
    });
  }

  const validation = validateSeoPack(pack, run.analysis, { language: current.language });
  try {
    const revision = await applyFieldPatchesInTransaction({
      seoVersionId: args.seoVersionId,
      expectedRevision: args.expectedRevision,
      pack,
      validation,
      revisionLogs: [
        {
          fieldPath,
          previousValue: existing.value,
          newValue: newField.value,
          source: 'regeneration',
          userId: args.userId,
          instruction: args.editorInstruction,
        },
      ],
    });
    return { field: newField, consequences, revision };
  } catch (e) {
    if (e instanceof Error && e.message === 'revision_conflict') {
      throw Object.assign(new Error('Konflikt: versionen er ændret'), {
        code: 'revision_conflict',
      });
    }
    throw e;
  }
}
