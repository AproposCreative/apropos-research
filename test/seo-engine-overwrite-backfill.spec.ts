import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertApplyOverwriteGates,
  buildLocaleArticleKey,
  buildOverwriteSeoEngineInput,
  buildSourceSignature,
  classifyLocaleFetchFailure,
  exactReadbackMatch,
  loadAndValidateFromReport,
  parseBackfillCliArgs,
  resolveEffectiveLimit,
  resolveEffectiveLocales,
  runOverwriteBackfill,
  selectNewestPublishedItems,
  sourceSignaturesMatch,
  validateOverwriteFields,
  type FrozenManifestEntry,
  type ListedArticleItem,
} from '../lib/seo-engine/overwrite-backfill';
import { buildEmptyOnlyDomainPatch } from '../lib/seo-engine/auto-seo-worker';
import { WebflowLocaleFetchError } from '../lib/webflow/locale-items';

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
        results: [],
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
