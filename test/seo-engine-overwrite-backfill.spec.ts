import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertApplyOverwriteGates,
  buildLocaleArticleKey,
  buildOverwriteSeoEngineInput,
  buildResumePlan,
  buildSourceSignature,
  classifyLocaleFetchFailure,
  computeTransientBackoffMs,
  exactReadbackMatch,
  isTransientFetchFailure,
  loadAndValidateFromReport,
  assertDryRunReportCleanForApply,
  mergeDryRunReports,
  parseBackfillCliArgs,
  resolveEffectiveLimit,
  resolveEffectiveLocales,
  runOverwriteBackfill,
  selectNewestPublishedItems,
  sourceSignaturesMatch,
  validateOverwriteFields,
  withTransientFetchRetry,
  type ApplyReportDocument,
  type DryRunReportDocument,
  type FrozenManifestEntry,
  type ListedArticleItem,
} from '../lib/seo-engine/overwrite-backfill';
import { buildEmptyOnlyDomainPatch } from '../lib/seo-engine/auto-seo-worker';
import { parseRetryAfterMs, WebflowLocaleFetchError } from '../lib/webflow/locale-items';

const body = `<p>${'ord '.repeat(80)}</p>`;

function aiAnalyze() {
  return async () =>
    ({
      analysisRunId: 'ar1',
      inputVersionHash: 'h',
      inputMode: 'full' as const,
      mode: 'ai' as const,
      analysis: {
        schemaVersion: 'editorial-analysis-v1',
        primaryEntity: { asWritten: 'Artikel', normalized: 'artikel' },
        spoilerSensitive: false,
        facts: { claimed: [], missing: [] },
      } as never,
      articleKey: 'wf:item1:da',
    }) as never;
}

function aiStrategize(title = 'Ny SEO titel om Artikel') {
  return async () =>
    ({
      seoVersionId: 'sv1',
      revision: 1,
      mode: 'ai' as const,
      stale: false,
      pack: {
        recommended: {
          fields: {
            seoTitle: { value: title, locked: false },
            metaDescription: {
              value:
                'Ny meta description om Artikel uden forbudte fraser og med rimelig længde.',
              locked: false,
            },
            slug: { value: 'slug-1', locked: false },
            jsonLd: { value: { '@graph': [{ '@type': 'Article' }] }, locked: false },
          },
        },
        alternatives: [],
      },
      validation: { errors: [], warnings: [], suggestions: [] },
    }) as never;
}

describe('overwrite backfill CLI gates', () => {
  it('defaults to dry-run', () => {
    const cli = parseBackfillCliArgs([]);
    expect(cli.dryRun).toBe(true);
    expect(cli.apply).toBe(false);
  });

  it('rejects --apply without --overwrite', () => {
    const cli = parseBackfillCliArgs([
      '--apply',
      '--limit=10',
      '--locales=da,en',
      '--from-report=r.json',
    ]);
    const gate = assertApplyOverwriteGates(cli);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/overwrite/i);
  });

  it('rejects --apply --overwrite without --from-report', () => {
    const cli = parseBackfillCliArgs([
      '--apply',
      '--overwrite',
      '--limit=10',
      '--locales=da,en',
    ]);
    const gate = assertApplyOverwriteGates(cli);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/from-report/i);
  });

  it('rejects --apply --overwrite without explicit limit=10', () => {
    const cli = parseBackfillCliArgs([
      '--apply',
      '--overwrite',
      '--locales=da,en',
      '--from-report=r.json',
    ]);
    const gate = assertApplyOverwriteGates(cli);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/limit=10/);
  });

  it('accepts full apply gate set including from-report', () => {
    const cli = parseBackfillCliArgs([
      '--apply',
      '--overwrite',
      '--limit=10',
      '--locales=da,en',
      '--from-report=/tmp/report.json',
    ]);
    expect(assertApplyOverwriteGates(cli)).toEqual({ ok: true });
    expect(cli.fromReport).toBe('/tmp/report.json');
    expect(resolveEffectiveLimit(cli)).toBe(10);
    expect(resolveEffectiveLocales(cli)).toEqual(['da', 'en']);
  });
});

describe('overwrite backfill selection', () => {
  const items: ListedArticleItem[] = [
    {
      id: 'old',
      slug: 'old',
      title: 'Old',
      lastPublished: '2024-01-01T00:00:00.000Z',
      lastUpdated: null,
      isDraft: false,
    },
    {
      id: 'new',
      slug: 'new',
      title: 'New',
      lastPublished: '2026-07-01T00:00:00.000Z',
      lastUpdated: null,
      isDraft: false,
    },
    {
      id: 'draft',
      slug: 'draft',
      title: 'Draft',
      lastPublished: '2026-08-01T00:00:00.000Z',
      lastUpdated: null,
      isDraft: true,
    },
    {
      id: 'mid',
      slug: 'mid',
      title: 'Mid',
      lastPublished: '2025-06-01T00:00:00.000Z',
      lastUpdated: null,
      isDraft: false,
    },
  ];

  it('picks newest published by lastPublished and skips drafts', () => {
    const selected = selectNewestPublishedItems(items, 2);
    expect(selected.map((s) => s.id)).toEqual(['new', 'mid']);
  });
});

describe('overwrite input unlock + articleKey', () => {
  it('nulls existing SEO and omits undefined optionals', () => {
    const input = buildOverwriteSeoEngineInput({
      fieldData: {
        name: 'Titel',
        content: 'x'.repeat(250),
        'seo-title': 'LOCKED CMS TITLE',
        'meta-description': 'LOCKED CMS META THAT IS LONG ENOUGH',
      },
      language: 'da',
    });
    expect(input.existingSeoTitle).toBeNull();
    expect(input.existingMetaDescription).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(input, 'existingUrl')).toBe(false);
    expect(buildLocaleArticleKey('abc', 'en')).toBe('wf:abc:en');
  });

  it('does not change auto-worker empty-only helper', () => {
    const patch = buildEmptyOnlyDomainPatch({
      seoTitleEmpty: false,
      metaDescriptionEmpty: true,
      seoTitle: 'T',
      metaDescription: 'M',
    });
    expect(patch).toEqual({ metaDescription: 'M' });
  });
});

describe('overwrite validation + readback + signatures', () => {
  it('rejects empty / over-max / forbidden phrases', () => {
    const bad = validateOverwriteFields({
      seoTitle: '',
      metaDescription: 'alt du skal vide om filmen her',
    });
    expect(bad.ok).toBe(false);
  });

  it('exact readback compare', () => {
    expect(
      exactReadbackMatch({
        expectedSeoTitle: 'A',
        expectedMetaDescription: 'B',
        fieldData: { 'seo-title': 'A', 'meta-description': 'B' },
      })
    ).toBe(true);
  });

  it('sourceSignaturesMatch detects concurrent edits', () => {
    const base = {
      lastUpdated: 't1',
      lastPublished: 'p1',
      contentHash: 'c1',
      inputVersionHash: 'i1',
      oldSeoTitle: 'old',
      oldMetaDescription: 'meta',
    };
    expect(sourceSignaturesMatch(base, { ...base })).toBe(true);
    expect(sourceSignaturesMatch(base, { ...base, lastUpdated: 't2' })).toBe(false);
    expect(sourceSignaturesMatch(base, { ...base, contentHash: 'c2' })).toBe(false);
  });
});

describe('1) fetch failure classification', () => {
  it('only 404 is missing; auth/429/5xx/network are blocking', () => {
    expect(classifyLocaleFetchFailure(new WebflowLocaleFetchError('gone', 404)).kind).toBe(
      'missing'
    );
    expect(classifyLocaleFetchFailure(new WebflowLocaleFetchError('nope', 401)).kind).toBe(
      'blocking'
    );
    expect(classifyLocaleFetchFailure(new WebflowLocaleFetchError('nope', 403)).kind).toBe(
      'blocking'
    );
    expect(classifyLocaleFetchFailure(new WebflowLocaleFetchError('slow', 429)).kind).toBe(
      'blocking'
    );
    expect(classifyLocaleFetchFailure(new WebflowLocaleFetchError('boom', 500)).kind).toBe(
      'blocking'
    );
    expect(classifyLocaleFetchFailure(new WebflowLocaleFetchError('net', 0)).kind).toBe(
      'blocking'
    );
    expect(classifyLocaleFetchFailure(new Error('random')).kind).toBe('blocking');
  });

  it('dry-run: 404 EN skips; 500 blocks (not treated as missing)', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-bf-fetch-'));
    const { resolveWebflowLocaleIds } = await import('../lib/webflow/locale-items');
    const { en, dk } = resolveWebflowLocaleIds();

    const result = await runOverwriteBackfill({
      limit: 1,
      locales: ['da', 'en'],
      apply: false,
      reportDir,
      onLog: () => {},
      listFn: async () => [
        {
          id: 'item1',
          slug: 'slug-1',
          title: 'Artikel 1',
          lastPublished: '2026-07-20T12:00:00.000Z',
          lastUpdated: '2026-07-20T12:00:00.000Z',
          isDraft: false,
        },
      ],
      fetchFn: async (itemId, cmsLocaleId) => {
        if (cmsLocaleId === en) {
          throw new WebflowLocaleFetchError('not found', 404);
        }
        if (cmsLocaleId === dk) {
          return {
            id: itemId,
            cmsLocaleId,
            lastPublished: '2026-07-20T12:00:00.000Z',
            lastUpdated: '2026-07-20T12:00:00.000Z',
            isDraft: false,
            fieldData: {
              name: 'Artikel 1',
              slug: 'slug-1',
              content: body,
              'seo-title': 'OLD',
              'meta-description': 'OLD META',
            },
          };
        }
        throw new WebflowLocaleFetchError('server', 500);
      },
      analyzeFn: aiAnalyze(),
      strategizeFn: aiStrategize(),
      patchFn: async () => {
        throw new Error('must not patch in dry-run');
      },
      publishFn: async () => {
        throw new Error('must not publish in dry-run');
      },
    });

    const locales = result.results[0]?.locales || [];
    expect(locales.some((l) => l.locale === 'en' && l.status === 'skipped_missing')).toBe(true);
    expect(locales.some((l) => l.locale === 'da' && l.status === 'proposed')).toBe(true);
    expect(result.frozenManifest.length).toBe(1);
  });

  it('blocking 500 during backup stops dry-run', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-bf-500-'));
    const result = await runOverwriteBackfill({
      limit: 1,
      locales: ['da'],
      apply: false,
      reportDir,
      onLog: () => {},
      listFn: async () => [
        {
          id: 'itemX',
          slug: 'x',
          title: 'X',
          lastPublished: '2026-07-20T12:00:00.000Z',
          lastUpdated: null,
          isDraft: false,
        },
      ],
      fetchFn: async () => {
        throw new WebflowLocaleFetchError('server error', 503);
      },
      analyzeFn: aiAnalyze(),
      strategizeFn: aiStrategize(),
    });
    expect(result.stoppedOnError).toBe(true);
    expect(result.errorMessage).toMatch(/Blocking fetch/i);
  });
});

describe('2) unpublished locale stop/skip', () => {
  it('stops when DA is no longer published', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-bf-unpub-'));
    const result = await runOverwriteBackfill({
      limit: 1,
      locales: ['da'],
      apply: false,
      reportDir,
      onLog: () => {},
      listFn: async () => [
        {
          id: 'itemD',
          slug: 'd',
          title: 'D',
          lastPublished: '2026-07-20T12:00:00.000Z',
          lastUpdated: '2026-07-20T12:00:00.000Z',
          isDraft: false,
        },
      ],
      fetchFn: async (itemId, cmsLocaleId) => ({
        id: itemId,
        cmsLocaleId,
        lastPublished: null,
        lastUpdated: '2026-07-20T12:00:00.000Z',
        isDraft: true,
        fieldData: { name: 'D', slug: 'd', content: body },
      }),
      analyzeFn: aiAnalyze(),
      strategizeFn: aiStrategize(),
    });
    expect(result.stoppedOnError).toBe(true);
    expect(result.errorMessage).toMatch(/no longer published/i);
  });
});

describe('3) concurrent change protection + 4) from-report gate', () => {
  it('apply requires valid frozen report and refuses empty/wrong mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seo-bf-fr-'));
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ mode: 'apply', frozenManifest: [] }), 'utf8');
    expect(loadAndValidateFromReport(bad).ok).toBe(false);

    const empty = join(dir, 'empty.json');
    writeFileSync(
      empty,
      JSON.stringify({ mode: 'dry-run', stoppedOnError: false, frozenManifest: [] }),
      'utf8'
    );
    expect(loadAndValidateFromReport(empty).ok).toBe(false);
  });

  it('apply from-report writes frozen values and stops on signature mismatch', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-bf-apply-'));
    const { resolveWebflowLocaleIds } = await import('../lib/webflow/locale-items');
    const { dk } = resolveWebflowLocaleIds();

    const fieldData = {
      name: 'Artikel 2',
      slug: 'slug-2',
      content: body,
      'seo-title': 'OLD',
      'meta-description': 'OLD META',
    };
    const input = buildOverwriteSeoEngineInput({ fieldData, language: 'da' });
    const item = {
      id: 'item2',
      cmsLocaleId: dk,
      lastPublished: '2026-07-21T12:00:00.000Z',
      lastUpdated: '2026-07-21T12:00:00.000Z',
      isDraft: false,
      fieldData,
    };
    const sig = buildSourceSignature({
      item,
      input,
      oldSeoTitle: 'OLD',
      oldMetaDescription: 'OLD META',
    });

    const manifest: FrozenManifestEntry[] = [
      {
        itemId: 'item2',
        locale: 'da',
        cmsLocaleId: dk,
        articleKey: 'wf:item2:da',
        newSeoTitle: 'Ny SEO titel om Artikel',
        newMetaDescription:
          'Ny meta description om Artikel uden forbudte fraser og med rimelig længde.',
        wasPublished: true,
        sourceSignature: sig,
      },
    ];

    const dryReport = join(reportDir, 'approved-dry.json');
    writeFileSync(
      dryReport,
      JSON.stringify({
        schemaVersion: 2,
        mode: 'dry-run',
        stoppedOnError: false,
        selected: [
          {
            id: 'item2',
            slug: 'slug-2',
            title: 'Artikel 2',
            lastPublished: '2026-07-21T12:00:00.000Z',
            locales: ['da'],
          },
        ],
        results: [
          {
            itemId: 'item2',
            slug: 'slug-2',
            title: 'Artikel 2',
            locales: [
              {
                locale: 'da',
                status: 'proposed',
                proposal: {
                  locale: 'da',
                  cmsLocaleId: dk,
                  articleKey: 'wf:item2:da',
                  title: 'Artikel 2',
                  slug: 'slug-2',
                  wasPublished: true,
                  oldSeoTitle: 'OLD',
                  oldMetaDescription: 'OLD META',
                  newSeoTitle: manifest[0].newSeoTitle,
                  newMetaDescription: manifest[0].newMetaDescription,
                  analysisRunId: 'ar',
                  seoVersionId: 'sv',
                  mode: 'ai',
                  validationErrors: [],
                  validationWarnings: [],
                  sourceSignature: sig,
                },
              },
            ],
          },
        ],
        frozenManifest: manifest,
      }),
      'utf8'
    );

    let patchCalls = 0;
    let mutated = false;

    // First: concurrent change (lastUpdated differs) → stop, no successful write completion
    const blocked = await runOverwriteBackfill({
      limit: 10,
      locales: ['da', 'en'],
      apply: true,
      fromReportPath: dryReport,
      reportDir,
      onLog: () => {},
      fetchFn: async (itemId, cmsLocaleId) => ({
        ...item,
        id: itemId,
        cmsLocaleId,
        lastUpdated: 'CHANGED',
      }),
      patchFn: async () => {
        patchCalls += 1;
      },
      publishFn: async () => {},
    });
    expect(blocked.stoppedOnError).toBe(true);
    expect(blocked.errorMessage).toMatch(/Concurrent change/i);
    expect(patchCalls).toBe(0);

    // Second: matching signature → write + readback ok
    const okRun = await runOverwriteBackfill({
      limit: 10,
      locales: ['da', 'en'],
      apply: true,
      fromReportPath: dryReport,
      reportDir: mkdtempSync(join(tmpdir(), 'seo-bf-apply-ok-')),
      onLog: () => {},
      fetchFn: async (itemId, cmsLocaleId) => {
        if (mutated) {
          return {
            ...item,
            id: itemId,
            cmsLocaleId,
            fieldData: {
              ...fieldData,
              'seo-title': manifest[0].newSeoTitle,
              'meta-description': manifest[0].newMetaDescription,
            },
          };
        }
        return { ...item, id: itemId, cmsLocaleId };
      },
      patchFn: async () => {
        patchCalls += 1;
        mutated = true;
      },
      publishFn: async () => {},
    });
    expect(okRun.stoppedOnError).toBe(false);
    expect(patchCalls).toBe(1);
    expect(okRun.results[0]?.locales[0]?.status).toBe('written');
  });

  it('dry-run never calls patch/publish', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-bf-dry-'));
    let patchCalls = 0;
    const result = await runOverwriteBackfill({
      limit: 1,
      locales: ['da'],
      apply: false,
      reportDir,
      onLog: () => {},
      listFn: async () => [
        {
          id: 'item1',
          slug: 'slug-1',
          title: 'Artikel 1',
          lastPublished: '2026-07-20T12:00:00.000Z',
          lastUpdated: '2026-07-20T12:00:00.000Z',
          isDraft: false,
        },
      ],
      fetchFn: async (itemId, cmsLocaleId) => ({
        id: itemId,
        cmsLocaleId,
        lastPublished: '2026-07-20T12:00:00.000Z',
        lastUpdated: '2026-07-20T12:00:00.000Z',
        isDraft: false,
        fieldData: {
          name: 'Artikel 1',
          slug: 'slug-1',
          content: body,
          'seo-title': 'OLD TITLE',
          'meta-description': 'OLD META DESCRIPTION TEXT HERE',
        },
      }),
      analyzeFn: aiAnalyze(),
      strategizeFn: aiStrategize(),
      patchFn: async () => {
        patchCalls += 1;
      },
      publishFn: async () => {
        patchCalls += 1;
      },
    });
    expect(result.mode).toBe('dry-run');
    expect(patchCalls).toBe(0);
    expect(result.frozenManifest.length).toBe(1);
    const report = JSON.parse(readFileSync(result.reportPath, 'utf8')) as {
      frozenManifest: unknown[];
    };
    expect(report.frozenManifest).toHaveLength(1);
  });
});

describe('strategy pack AI coercion', () => {
  function validDirection(id: string, title: string, meta: string) {
    return {
      id,
      family: 'entity_first',
      intentPriority: 'x',
      whyFits: 'y',
      primaryEntityEmphasis: 'z',
      freshnessStance: 'f',
      editorialGuardrail: 'g',
      riskAvoided: 'r',
      fields: {
        seoTitle: {
          value: title,
          rationale: 'r',
          confidence: 0.8,
          sources: ['article'],
          warnings: [],
          locked: false,
        },
        metaDescription: {
          value: meta,
          rationale: 'r',
          confidence: 0.8,
          sources: ['article'],
          warnings: [],
          locked: false,
        },
      },
    };
  }

  it('fills missing secondary wrappers but never invents core SEO text', async () => {
    const { coerceStrategyPackAiOutput } = await import('../lib/seo-engine/coerce-strategy');
    const { SeoStrategyPackV1Schema } = await import('../lib/seo-engine/schema');
    const partial = {
      schemaVersion: 'seo-strategy-pack-v1',
      recommendedStrategyId: 'a',
      recommended: validDirection(
        'a',
        'Title',
        'Meta text that is long enough for usefulness here.'
      ),
      alternatives: [
        validDirection('b', 'Alt title B', 'Alt meta B that is long enough for usefulness here.'),
        validDirection('c', 'Alt title C', 'Alt meta C that is long enough for usefulness here.'),
      ],
      cmsPublishability: {
        seoTitle: 'cms_writable',
        metaDescription: 'cms_writable',
        ogTitle: 'generated_not_published',
        ogDescription: 'generated_not_published',
        jsonLd: 'generated_not_published',
      },
    };
    const coerced = coerceStrategyPackAiOutput(partial);
    const z = SeoStrategyPackV1Schema.safeParse(coerced);
    expect(z.success).toBe(true);
    if (z.success) {
      expect(z.data.recommended.fields.seoTitle.value).toBe('Title');
      expect(Array.isArray(z.data.recommended.fields.supportingTopics.value)).toBe(true);
    }
  });

  it('fail closed: does not invent seoTitle/metaDescription when missing', async () => {
    const { coerceStrategyPackAiOutput, StrategyCoerceError } = await import(
      '../lib/seo-engine/coerce-strategy'
    );
    const bad = {
      recommended: {
        id: 'a',
        family: 'entity_first',
        fields: {
          // seoTitle missing
          metaDescription: { value: 'Meta only', rationale: 'r', confidence: 0.5, sources: ['article'], warnings: [], locked: false },
        },
      },
      alternatives: [
        validDirection('b', 'Alt B', 'Alt meta B long enough.'),
        validDirection('c', 'Alt C', 'Alt meta C long enough.'),
      ],
    };
    expect(() => coerceStrategyPackAiOutput(bad)).toThrow(StrategyCoerceError);
    expect(() => coerceStrategyPackAiOutput(bad)).toThrow(/seoTitle/i);
  });

  it('fail closed: empty alternatives do not mask invalid recommendation', async () => {
    const { coerceStrategyPackAiOutput, StrategyCoerceError } = await import(
      '../lib/seo-engine/coerce-strategy'
    );
    const badRec = {
      recommended: {
        id: 'a',
        family: 'entity_first',
        fields: {}, // invalid recommended
      },
      alternatives: [{}, {}], // incomplete alts must not paper over
    };
    expect(() => coerceStrategyPackAiOutput(badRec)).toThrow(StrategyCoerceError);

    const goodRecBadAlts = {
      recommended: validDirection('a', 'Title', 'Meta text that is long enough for usefulness here.'),
      alternatives: [{}, {}],
    };
    expect(() => coerceStrategyPackAiOutput(goodRecBadAlts)).toThrow(/alternatives/i);
  });

  it('coerces mistyped imageCaption objects to null without inventing seoTitle', async () => {
    const { coerceStrategyPackAiOutput } = await import('../lib/seo-engine/coerce-strategy');
    const { SeoStrategyPackV1Schema } = await import('../lib/seo-engine/schema');
    const base = validDirection('a', 'Keep Title', 'Keep meta text that is long enough here.');
    const pack = {
      recommended: {
        ...base,
        fields: {
          ...base.fields,
          imageCaption: {
            value: { weird: true },
            rationale: 'x',
            confidence: 0.4,
            sources: ['inference'],
            warnings: [],
            locked: false,
          },
        },
      },
      alternatives: [
        validDirection('b', 'Alt B', 'Alt meta B that is long enough for usefulness here.'),
        validDirection('c', 'Alt C', 'Alt meta C that is long enough for usefulness here.'),
      ],
    };
    const coerced = coerceStrategyPackAiOutput(pack) as {
      recommended: { fields: { seoTitle: { value: string }; imageCaption: { value: unknown } } };
    };
    expect(coerced.recommended.fields.seoTitle.value).toBe('Keep Title');
    expect(coerced.recommended.fields.imageCaption.value).toBeNull();
    expect(SeoStrategyPackV1Schema.safeParse(coerced).success).toBe(true);
  });
});


describe('dry-run report apply gate + compose', () => {
  const sig = {
    lastUpdated: 't1',
    lastPublished: 'p1',
    contentHash: 'c1',
    inputVersionHash: 'i1',
    oldSeoTitle: 'old',
    oldMetaDescription: 'old meta',
  };

  function proposal(locale: 'da' | 'en', title: string, meta: string) {
    return {
      locale,
      cmsLocaleId: locale === 'da' ? 'dk' : 'en',
      articleKey: `wf:item1:${locale}`,
      title: 'T',
      slug: 's',
      wasPublished: true,
      oldSeoTitle: 'old',
      oldMetaDescription: 'old meta',
      newSeoTitle: title,
      newMetaDescription: meta,
      analysisRunId: 'a',
      seoVersionId: 'v',
      mode: 'ai' as const,
      validationErrors: [] as string[],
      validationWarnings: [] as string[],
      sourceSignature: { ...sig },
    };
  }

  function cleanReport() {
    const da = proposal(
      'da',
      'En præcis titel om filmen',
      'Kort, konkret meta om filmen uden forbudte fraser og med nok tegn til at være nyttig.'
    );
    return {
      schemaVersion: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      mode: 'dry-run' as const,
      limit: 10,
      locales: ['da', 'en'] as Array<'da' | 'en'>,
      backupPath: null,
      stoppedOnError: false,
      errorMessage: null,
      selected: [
        {
          id: 'item1',
          slug: 's',
          title: 'T',
          lastPublished: '2026-01-01T00:00:00.000Z',
          locales: ['da', 'en'] as Array<'da' | 'en'>,
        },
      ],
      results: [
        {
          itemId: 'item1',
          slug: 's',
          title: 'T',
          locales: [
            { locale: 'da' as const, status: 'proposed' as const, proposal: da },
            {
              locale: 'en' as const,
              status: 'skipped_missing' as const,
              reason: 'missing',
            },
          ],
        },
      ],
      frozenManifest: [
        {
          itemId: 'item1',
          locale: 'da' as const,
          cmsLocaleId: 'dk',
          articleKey: 'wf:item1:da',
          newSeoTitle: da.newSeoTitle,
          newMetaDescription: da.newMetaDescription,
          wasPublished: true,
          sourceSignature: { ...sig },
        },
      ],
    };
  }

  it('rejects reports with error even when stoppedOnError=false', () => {
    const dirty = cleanReport();
    // Intentionally unclean fixture for gate tests
    (dirty.results[0].locales as unknown as Array<{ locale: string; status: string; reason?: string }>)[0] = {
      locale: 'da',
      status: 'error',
      reason: 'AI-analyse fejlede Zod-validering',
    };
    // Keep a stale manifest so emptiness is not the first failure
    const gate = assertDryRunReportCleanForApply(dirty);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/unresolved status "error"/i);
  });

  it('rejects skipped_validation / blocked_fetch', () => {
    for (const status of ['skipped_validation', 'blocked_fetch'] as const) {
      const dirty = cleanReport();
      (dirty.results[0].locales as unknown as Array<{ locale: string; status: string; reason?: string }>)[0] = {
        locale: 'da',
        status,
        reason: 'x',
      };
      const gate = assertDryRunReportCleanForApply(dirty);
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.reason).toMatch(new RegExp(status));
    }
  });

  it('accepts clean proposed + EN skipped_missing with matching manifest', () => {
    expect(assertDryRunReportCleanForApply(cleanReport())).toEqual({ ok: true });
  });

  it('merges retry proposed locale over base error and rebuilds manifest', () => {
    const base = cleanReport();
    base.results[0].locales = [
      { locale: 'da', status: 'error', reason: 'zod' },
      { locale: 'en', status: 'skipped_missing', reason: 'missing' },
    ] as unknown as (typeof base.results)[0]['locales'];
    base.frozenManifest = [];

    const retryProp = proposal(
      'da',
      'Ny SEO titel om Artikel',
      'Ny meta description om Artikel uden forbudte fraser og med rimelig længde.'
    );
    const retry = {
      ...cleanReport(),
      selected: base.selected,
      results: [
        {
          itemId: 'item1',
          slug: 's',
          title: 'T',
          locales: [{ locale: 'da' as const, status: 'proposed' as const, proposal: retryProp }],
        },
      ],
      frozenManifest: [
        {
          itemId: 'item1',
          locale: 'da' as const,
          cmsLocaleId: 'dk',
          articleKey: 'wf:item1:da',
          newSeoTitle: retryProp.newSeoTitle,
          newMetaDescription: retryProp.newMetaDescription,
          wasPublished: true,
          sourceSignature: { ...sig },
        },
      ],
    };

    const merged = mergeDryRunReports({ base, retry });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.report.selected).toEqual(base.selected);
    expect(merged.report.frozenManifest).toHaveLength(1);
    expect(merged.report.results[0].locales.find((l) => l.locale === 'da')?.status).toBe(
      'proposed'
    );
    expect(assertDryRunReportCleanForApply(merged.report)).toEqual({ ok: true });
  });

  it('refuses merge conflict when base locale already proposed', () => {
    const base = cleanReport();
    const retry = cleanReport();
    const merged = mergeDryRunReports({ base, retry });
    expect(merged.ok).toBe(false);
    if (!merged.ok) expect(merged.reason).toMatch(/Conflict/i);
  });
});

describe('transient fetch retry + Retry-After', () => {
  it('parseRetryAfterMs supports seconds and HTTP-date', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs(null)).toBeNull();
    const future = new Date(Date.now() + 1500).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(500);
    expect(ms!).toBeLessThan(5000);
  });

  it('isTransientFetchFailure retries 429/5xx/network but not auth/404', () => {
    expect(isTransientFetchFailure(new WebflowLocaleFetchError('slow', 429, 1000))).toBe(true);
    expect(isTransientFetchFailure(new WebflowLocaleFetchError('boom', 503))).toBe(true);
    expect(isTransientFetchFailure(new WebflowLocaleFetchError('net', 0))).toBe(true);
    expect(isTransientFetchFailure(new WebflowLocaleFetchError('auth', 401))).toBe(false);
    expect(isTransientFetchFailure(new WebflowLocaleFetchError('auth', 403))).toBe(false);
    expect(isTransientFetchFailure(new WebflowLocaleFetchError('gone', 404))).toBe(false);
    expect(classifyLocaleFetchFailure(new WebflowLocaleFetchError('slow', 429, 1500)).retryAfterMs).toBe(
      1500
    );
  });

  it('computeTransientBackoffMs honors Retry-After within max', () => {
    expect(
      computeTransientBackoffMs({
        attempt: 0,
        baseDelayMs: 400,
        maxDelayMs: 8000,
        retryAfterMs: 2500,
      })
    ).toBe(2500);
    expect(
      computeTransientBackoffMs({
        attempt: 0,
        baseDelayMs: 400,
        maxDelayMs: 1000,
        retryAfterMs: 5000,
      })
    ).toBe(1000);
    expect(
      computeTransientBackoffMs({ attempt: 2, baseDelayMs: 400, maxDelayMs: 8000 })
    ).toBe(1600);
  });

  it('withTransientFetchRetry retries 429 then succeeds; auth never retries', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const wrapped = withTransientFetchRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new WebflowLocaleFetchError('rate', 429, 50);
        return {
          id: 'x',
          cmsLocaleId: 'en',
          fieldData: {},
          lastPublished: 't',
          lastUpdated: 't',
          isDraft: false,
        };
      },
      {
        maxAttempts: 5,
        baseDelayMs: 10,
        maxDelayMs: 100,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      }
    );
    const ok = await wrapped('x', 'en');
    expect(ok.id).toBe('x');
    expect(calls).toBe(3);
    expect(sleeps).toEqual([50, 50]);

    let authCalls = 0;
    const authWrapped = withTransientFetchRetry(
      async () => {
        authCalls += 1;
        throw new WebflowLocaleFetchError('nope', 401);
      },
      { maxAttempts: 5, sleep: async () => {} }
    );
    await expect(authWrapped('x', 'en')).rejects.toMatchObject({ status: 401 });
    expect(authCalls).toBe(1);
  });

  it('apply readback survives transient 429 via retry wrapper', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-bf-retry-rb-'));
    const { resolveWebflowLocaleIds } = await import('../lib/webflow/locale-items');
    const { dk } = resolveWebflowLocaleIds();
    const sig = {
      lastUpdated: '2026-07-20T12:00:00.000Z',
      lastPublished: '2026-07-20T12:00:00.000Z',
      contentHash: 'c1',
      inputVersionHash: 'i1',
      oldSeoTitle: 'OLD',
      oldMetaDescription: 'OLD META',
    };
    // contentHash must match hashCmsContent of fieldData — use buildSourceSignature in a real apply test pattern
    const fieldData = {
      name: 'Artikel 2',
      slug: 'slug-2',
      content: body,
      'seo-title': 'OLD',
      'meta-description': 'OLD META',
    };
    const item = {
      id: 'item2',
      cmsLocaleId: dk,
      lastPublished: '2026-07-20T12:00:00.000Z',
      lastUpdated: '2026-07-20T12:00:00.000Z',
      isDraft: false,
      fieldData,
    };
    const liveSig = buildSourceSignature({
      item,
      input: buildOverwriteSeoEngineInput({ fieldData, language: 'da' }),
      oldSeoTitle: 'OLD',
      oldMetaDescription: 'OLD META',
    });
    const manifest: FrozenManifestEntry[] = [
      {
        itemId: 'item2',
        locale: 'da',
        cmsLocaleId: dk,
        articleKey: 'wf:item2:da',
        newSeoTitle: 'Ny SEO titel om Artikel',
        newMetaDescription: 'En meta description der er lang nok til validation check.',
        wasPublished: true,
        sourceSignature: liveSig,
      },
    ];
    const dryReport = join(reportDir, 'dry.json');
    writeFileSync(
      dryReport,
      JSON.stringify({
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        mode: 'dry-run',
        limit: 10,
        locales: ['da', 'en'],
        backupPath: null,
        stoppedOnError: false,
        errorMessage: null,
        selected: [
          {
            id: 'item2',
            slug: 'slug-2',
            title: 'Artikel 2',
            lastPublished: '2026-07-21T12:00:00.000Z',
            locales: ['da'],
          },
        ],
        results: [
          {
            itemId: 'item2',
            slug: 'slug-2',
            title: 'Artikel 2',
            locales: [
              {
                locale: 'da',
                status: 'proposed',
                proposal: {
                  locale: 'da',
                  cmsLocaleId: dk,
                  articleKey: 'wf:item2:da',
                  title: 'Artikel 2',
                  slug: 'slug-2',
                  wasPublished: true,
                  oldSeoTitle: 'OLD',
                  oldMetaDescription: 'OLD META',
                  newSeoTitle: manifest[0].newSeoTitle,
                  newMetaDescription: manifest[0].newMetaDescription,
                  analysisRunId: 'ar',
                  seoVersionId: 'sv',
                  mode: 'ai',
                  validationErrors: [],
                  validationWarnings: [],
                  sourceSignature: liveSig,
                },
              },
            ],
          },
        ],
        frozenManifest: manifest,
      }),
      'utf8'
    );

    let fetchCalls = 0;
    let mutated = false;
    const result = await runOverwriteBackfill({
      limit: 10,
      locales: ['da', 'en'],
      apply: true,
      fromReportPath: dryReport,
      reportDir: mkdtempSync(join(tmpdir(), 'seo-bf-retry-apply-')),
      onLog: () => {},
      fetchRetry: { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 5, sleep: async () => {} },
      fetchFn: async (itemId, cmsLocaleId) => {
        fetchCalls += 1;
        // After patch, first readback fails with 429, then succeeds
        if (mutated) {
          if (fetchCalls === 3) {
            throw new WebflowLocaleFetchError('rate', 429, 1);
          }
          return {
            ...item,
            id: itemId,
            cmsLocaleId,
            fieldData: {
              ...fieldData,
              'seo-title': manifest[0].newSeoTitle,
              'meta-description': manifest[0].newMetaDescription,
            },
          };
        }
        return { ...item, id: itemId, cmsLocaleId };
      },
      patchFn: async () => {
        mutated = true;
      },
      publishFn: async () => {},
    });
    expect(result.stoppedOnError).toBe(false);
    expect(result.results[0]?.locales[0]?.status).toBe('written');
    expect(fetchCalls).toBeGreaterThanOrEqual(3);
  });
});

describe('resume plan from partial apply', () => {
  function makeComposite(entries: FrozenManifestEntry[]): DryRunReportDocument {
    return {
      schemaVersion: 2,
      createdAt: 't',
      mode: 'dry-run',
      limit: 10,
      locales: ['da', 'en'],
      backupPath: null,
      stoppedOnError: false,
      errorMessage: null,
      selected: [],
      results: entries.map((e) => ({
        itemId: e.itemId,
        slug: 's',
        title: 't',
        locales: [
          {
            locale: e.locale,
            status: 'proposed' as const,
            proposal: {
              locale: e.locale,
              cmsLocaleId: e.cmsLocaleId,
              articleKey: e.articleKey,
              title: 't',
              slug: 's',
              wasPublished: true,
              oldSeoTitle: 'o',
              oldMetaDescription: 'm',
              newSeoTitle: e.newSeoTitle,
              newMetaDescription: e.newMetaDescription,
              analysisRunId: 'a',
              seoVersionId: 'v',
              mode: 'ai' as const,
              validationErrors: [],
              validationWarnings: [],
              sourceSignature: e.sourceSignature,
            },
          },
        ],
      })),
      frozenManifest: entries,
    };
  }

  const sig = {
    lastUpdated: 't',
    lastPublished: 'p',
    contentHash: 'c',
    inputVersionHash: 'i',
    oldSeoTitle: 'o',
    oldMetaDescription: 'm',
  };

  it('identifies verified + recover + unattempted (Napalm-style)', () => {
    const entries: FrozenManifestEntry[] = [
      {
        itemId: 'a',
        locale: 'da',
        cmsLocaleId: 'dk',
        articleKey: 'wf:a:da',
        newSeoTitle: 'Title A DA long enough',
        newMetaDescription: 'Meta A DA that is long enough for validation purposes here.',
        wasPublished: true,
        sourceSignature: sig,
      },
      {
        itemId: 'b',
        locale: 'en',
        cmsLocaleId: 'en',
        articleKey: 'wf:b:en',
        newSeoTitle: 'Title B EN long enough',
        newMetaDescription: 'Meta B EN that is long enough for validation purposes here.',
        wasPublished: true,
        sourceSignature: sig,
      },
      {
        itemId: 'c',
        locale: 'da',
        cmsLocaleId: 'dk',
        articleKey: 'wf:c:da',
        newSeoTitle: 'Title C DA long enough',
        newMetaDescription: 'Meta C DA that is long enough for validation purposes here.',
        wasPublished: true,
        sourceSignature: sig,
      },
      {
        itemId: 'c',
        locale: 'en',
        cmsLocaleId: 'en',
        articleKey: 'wf:c:en',
        newSeoTitle: 'Title C EN long enough',
        newMetaDescription: 'Meta C EN that is long enough for validation purposes here.',
        wasPublished: true,
        sourceSignature: sig,
      },
    ];
    const composite = makeComposite(entries);
    const partial: ApplyReportDocument = {
      createdAt: 't',
      mode: 'apply',
      backupPath: '/tmp/b.json',
      stoppedOnError: true,
      errorMessage: 'Readback fetch failed',
      results: [
        {
          itemId: 'a',
          slug: 's',
          title: 't',
          locales: [{ locale: 'da', status: 'written', readbackOk: true, published: true }],
        },
        {
          itemId: 'b',
          slug: 's',
          title: 't',
          locales: [{ locale: 'en', status: 'error', published: true, reason: 'Readback fetch failed' }],
        },
      ],
    };
    const planned = buildResumePlan({ composite, partialApply: partial });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.verifiedKeysFromPartial).toEqual(['a:da']);
    expect(planned.plan.recoverKeys).toEqual(['b:en']);
    expect(planned.plan.unattemptedKeys).toEqual(['c:da', 'c:en']);
    expect(planned.plan.toWrite.map((e) => `${e.itemId}:${e.locale}`)).toEqual(['c:da', 'c:en']);
  });

  it('resume CLI gates require partial-apply-report', () => {
    const gate = assertApplyOverwriteGates(
      parseBackfillCliArgs([
        '--resume',
        '--overwrite',
        '--limit=10',
        '--locales=da,en',
        '--from-report=x.json',
      ])
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/partial-apply-report/i);
  });

  it('resume writes only unattempted and never re-patches verified', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-bf-resume-'));
    const { resolveWebflowLocaleIds } = await import('../lib/webflow/locale-items');
    const { dk, en } = resolveWebflowLocaleIds();

    const makeEntry = (
      id: string,
      locale: 'da' | 'en',
      cmsLocaleId: string,
      title: string,
      meta: string,
      fieldData: Record<string, unknown>
    ): { entry: FrozenManifestEntry; fieldData: Record<string, unknown> } => {
      const item = {
        id,
        cmsLocaleId,
        lastPublished: '2026-07-20T12:00:00.000Z',
        lastUpdated: '2026-07-20T12:00:00.000Z',
        isDraft: false,
        fieldData,
      };
      const liveSig = buildSourceSignature({
        item,
        input: buildOverwriteSeoEngineInput({ fieldData, language: locale }),
        oldSeoTitle: String(fieldData['seo-title']),
        oldMetaDescription: String(fieldData['meta-description']),
      });
      return {
        fieldData,
        entry: {
          itemId: id,
          locale,
          cmsLocaleId,
          articleKey: `wf:${id}:${locale}`,
          newSeoTitle: title,
          newMetaDescription: meta,
          wasPublished: true,
          sourceSignature: liveSig,
        },
      };
    };

    const a = makeEntry(
      'itemA',
      'da',
      dk,
      'Verified title for A item here',
      'Verified meta for A that is long enough for validation check.',
      {
        name: 'A',
        slug: 'a',
        content: body,
        'seo-title': 'OLD A',
        'meta-description': 'OLD META A',
      }
    );
    // Already written live state for A
    const aLive = {
      ...a.fieldData,
      'seo-title': a.entry.newSeoTitle,
      'meta-description': a.entry.newMetaDescription,
    };
    const b = makeEntry(
      'itemB',
      'en',
      en,
      'Recover title for B item here',
      'Recover meta for B that is long enough for validation check.',
      {
        name: 'B',
        slug: 'b',
        content: body,
        'seo-title': 'OLD B',
        'meta-description': 'OLD META B',
      }
    );
    const bLive = {
      ...b.fieldData,
      'seo-title': b.entry.newSeoTitle,
      'meta-description': b.entry.newMetaDescription,
    };
    const c = makeEntry(
      'itemC',
      'da',
      dk,
      'Write title for C item here now',
      'Write meta for C that is long enough for validation check.',
      {
        name: 'C',
        slug: 'c',
        content: body,
        'seo-title': 'OLD C',
        'meta-description': 'OLD META C',
      }
    );

    const entries = [a.entry, b.entry, c.entry];
    const composite = makeComposite(entries);
    // Fix composite selected/results for clean apply validation — buildResumePlan only needs frozenManifest + results proposed
    const compositePath = join(reportDir, 'composite.json');
    writeFileSync(compositePath, JSON.stringify(composite), 'utf8');

    const partialPath = join(reportDir, 'partial.json');
    writeFileSync(
      partialPath,
      JSON.stringify({
        createdAt: 't',
        mode: 'apply',
        backupPath: '/tmp/b.json',
        stoppedOnError: true,
        errorMessage: 'Readback fetch failed',
        results: [
          {
            itemId: 'itemA',
            slug: 'a',
            title: 'A',
            locales: [{ locale: 'da', status: 'written', readbackOk: true, published: true }],
          },
          {
            itemId: 'itemB',
            slug: 'b',
            title: 'B',
            locales: [{ locale: 'en', status: 'error', published: true }],
          },
        ],
      }),
      'utf8'
    );

    const patched: string[] = [];
    let cMutated = false;
    const result = await runOverwriteBackfill({
      limit: 10,
      locales: ['da', 'en'],
      apply: false,
      resume: true,
      fromReportPath: compositePath,
      partialApplyReportPath: partialPath,
      reportDir,
      onLog: () => {},
      fetchRetry: { maxAttempts: 2, sleep: async () => {} },
      writePaceMs: 0,
      fetchFn: async (itemId, cmsLocaleId) => {
        if (itemId === 'itemA') {
          return {
            id: itemId,
            cmsLocaleId,
            lastPublished: '2026-07-20T12:00:00.000Z',
            lastUpdated: '2026-07-20T12:00:00.000Z',
            isDraft: false,
            fieldData: aLive,
          };
        }
        if (itemId === 'itemB') {
          return {
            id: itemId,
            cmsLocaleId,
            lastPublished: '2026-07-20T12:00:00.000Z',
            lastUpdated: '2026-07-20T12:00:00.000Z',
            isDraft: false,
            fieldData: bLive,
          };
        }
        // itemC
        if (cMutated) {
          return {
            id: itemId,
            cmsLocaleId,
            lastPublished: '2026-07-20T12:00:00.000Z',
            lastUpdated: '2026-07-20T12:00:00.000Z',
            isDraft: false,
            fieldData: {
              ...c.fieldData,
              'seo-title': c.entry.newSeoTitle,
              'meta-description': c.entry.newMetaDescription,
            },
          };
        }
        return {
          id: itemId,
          cmsLocaleId,
          lastPublished: '2026-07-20T12:00:00.000Z',
          lastUpdated: '2026-07-20T12:00:00.000Z',
          isDraft: false,
          fieldData: c.fieldData,
        };
      },
      patchFn: async (itemId) => {
        patched.push(itemId);
        if (itemId === 'itemC') cMutated = true;
      },
      publishFn: async () => {},
    });

    expect(result.stoppedOnError).toBe(false);
    expect(patched).toEqual(['itemC']);
    expect(result.verifiedCount).toBe(3);
    expect(result.mode).toBe('resume');
  });
});
