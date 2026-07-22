import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertApplyOverwriteGates,
  buildLocaleArticleKey,
  buildOverwriteSeoEngineInput,
  exactReadbackMatch,
  parseBackfillCliArgs,
  resolveEffectiveLimit,
  resolveEffectiveLocales,
  runOverwriteBackfill,
  selectNewestPublishedItems,
  validateOverwriteFields,
  type ListedArticleItem,
} from '../lib/seo-engine/overwrite-backfill';
import { buildEmptyOnlyDomainPatch } from '../lib/seo-engine/auto-seo-worker';

describe('overwrite backfill CLI gates', () => {
  it('defaults to dry-run', () => {
    const cli = parseBackfillCliArgs([]);
    expect(cli.dryRun).toBe(true);
    expect(cli.apply).toBe(false);
  });

  it('rejects --apply without --overwrite', () => {
    const cli = parseBackfillCliArgs(['--apply', '--limit=10', '--locales=da,en']);
    const gate = assertApplyOverwriteGates(cli);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/overwrite/i);
  });

  it('rejects --apply --overwrite without explicit limit=10', () => {
    const cli = parseBackfillCliArgs(['--apply', '--overwrite', '--locales=da,en']);
    const gate = assertApplyOverwriteGates(cli);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/limit=10/);
  });

  it('rejects --apply --overwrite with wrong limit', () => {
    const cli = parseBackfillCliArgs([
      '--apply',
      '--overwrite',
      '--limit=5',
      '--locales=da,en',
    ]);
    const gate = assertApplyOverwriteGates(cli);
    expect(gate.ok).toBe(false);
  });

  it('rejects --apply --overwrite without locales=da,en', () => {
    const cli = parseBackfillCliArgs(['--apply', '--overwrite', '--limit=10']);
    const gate = assertApplyOverwriteGates(cli);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/locales/);
  });

  it('accepts full apply gate set', () => {
    const cli = parseBackfillCliArgs([
      '--apply',
      '--overwrite',
      '--limit=10',
      '--locales=da,en',
    ]);
    expect(assertApplyOverwriteGates(cli)).toEqual({ ok: true });
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
  it('nulls existing SEO so CMS values are not locked into AI input', () => {
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
    expect(input.editorialTitle).toBe('Titel');
    expect(input.language).toBe('da');
  });

  it('uses locale-separated articleKey', () => {
    expect(buildLocaleArticleKey('abc', 'da')).toBe('wf:abc:da');
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
    expect(patch.seoTitle).toBeUndefined();
  });
});

describe('overwrite validation + readback', () => {
  it('rejects empty / over-max / forbidden phrases', () => {
    const bad = validateOverwriteFields({
      seoTitle: '',
      metaDescription: 'alt du skal vide om filmen her',
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => /empty/i.test(e))).toBe(true);
    expect(bad.errors.some((e) => /forbidden/i.test(e))).toBe(true);

    const longTitle = 'x'.repeat(61);
    const longMeta = 'y'.repeat(156);
    const len = validateOverwriteFields({ seoTitle: longTitle, metaDescription: longMeta });
    expect(len.ok).toBe(false);
    expect(len.errors.some((e) => /seoTitle length/.test(e))).toBe(true);
    expect(len.errors.some((e) => /metaDescription length/.test(e))).toBe(true);
  });

  it('accepts valid fields', () => {
    const ok = validateOverwriteFields({
      seoTitle: 'En præcis titel om filmen',
      metaDescription:
        'Kort, konkret meta om filmen uden forbudte fraser og med nok tegn til at være nyttig.',
    });
    expect(ok.ok).toBe(true);
  });

  it('exact readback compare', () => {
    expect(
      exactReadbackMatch({
        expectedSeoTitle: 'A',
        expectedMetaDescription: 'B',
        fieldData: { 'seo-title': 'A', 'meta-description': 'B' },
      })
    ).toBe(true);
    expect(
      exactReadbackMatch({
        expectedSeoTitle: 'A',
        expectedMetaDescription: 'B',
        fieldData: { 'seo-title': 'A', 'meta-description': 'DIFF' },
      })
    ).toBe(false);
  });
});

describe('overwrite backfill dry-run / locale skip (injected)', () => {
  const body = `<p>${'ord '.repeat(80)}</p>`;

  it('dry-run never calls patch/publish; skips missing EN', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-backfill-'));
    let patchCalls = 0;
    let publishCalls = 0;

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
        // Simulate EN missing via throw for EN locale id from env defaults
        const { resolveWebflowLocaleIds } = await import('../lib/webflow/locale-items');
        const { en } = resolveWebflowLocaleIds();
        if (cmsLocaleId === en) {
          throw new Error('not found');
        }
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
            'seo-title': 'OLD TITLE',
            'meta-description': 'OLD META DESCRIPTION TEXT HERE',
          },
        };
      },
      analyzeFn: async () =>
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
        }) as never,
      strategizeFn: async () =>
        ({
          seoVersionId: 'sv1',
          revision: 1,
          mode: 'ai' as const,
          stale: false,
          pack: {
            recommended: {
              fields: {
                seoTitle: { value: 'Ny SEO titel om Artikel', locked: false },
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
        }) as never,
      patchFn: async () => {
        patchCalls += 1;
      },
      publishFn: async () => {
        publishCalls += 1;
      },
    });

    expect(result.mode).toBe('dry-run');
    expect(patchCalls).toBe(0);
    expect(publishCalls).toBe(0);
    const locales = result.results[0]?.locales || [];
    expect(locales.some((l) => l.locale === 'da' && l.status === 'proposed')).toBe(true);
    expect(locales.some((l) => l.locale === 'en' && l.status === 'skipped_missing')).toBe(true);

    const report = JSON.parse(readFileSync(result.reportPath, 'utf8')) as {
      mode: string;
      results: unknown[];
    };
    expect(report.mode).toBe('dry-run');
  });

  it('apply path patches once and verifies exact readback; stops on mismatch', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'seo-backfill-apply-'));
    let patchCalls = 0;
    let publishCalls = 0;
    let readAfterWrite = false;

    const result = await runOverwriteBackfill({
      limit: 1,
      locales: ['da'],
      apply: true,
      reportDir,
      onLog: () => {},
      listFn: async () => [
        {
          id: 'item2',
          slug: 'slug-2',
          title: 'Artikel 2',
          lastPublished: '2026-07-21T12:00:00.000Z',
          lastUpdated: '2026-07-21T12:00:00.000Z',
          isDraft: false,
        },
      ],
      fetchFn: async (itemId, cmsLocaleId) => {
        if (readAfterWrite) {
          // intentional mismatch
          return {
            id: itemId,
            cmsLocaleId,
            lastPublished: '2026-07-21T12:00:00.000Z',
            isDraft: false,
            fieldData: {
              name: 'Artikel 2',
              slug: 'slug-2',
              content: body,
              'seo-title': 'WRONG',
              'meta-description': 'WRONG META',
            },
          };
        }
        return {
          id: itemId,
          cmsLocaleId,
          lastPublished: '2026-07-21T12:00:00.000Z',
          isDraft: false,
          fieldData: {
            name: 'Artikel 2',
            slug: 'slug-2',
            content: body,
            'seo-title': 'OLD',
            'meta-description': 'OLD META',
          },
        };
      },
      analyzeFn: async () =>
        ({
          analysisRunId: 'ar2',
          inputVersionHash: 'h2',
          inputMode: 'full' as const,
          mode: 'ai' as const,
          analysis: {
            schemaVersion: 'editorial-analysis-v1',
            primaryEntity: { asWritten: 'Artikel', normalized: 'artikel' },
            spoilerSensitive: false,
            facts: { claimed: [], missing: [] },
          } as never,
          articleKey: 'wf:item2:da',
        }) as never,
      strategizeFn: async () =>
        ({
          seoVersionId: 'sv2',
          revision: 1,
          mode: 'ai' as const,
          stale: false,
          pack: {
            recommended: {
              fields: {
                seoTitle: { value: 'Ny SEO titel om Artikel', locked: false },
                metaDescription: {
                  value:
                    'Ny meta description om Artikel uden forbudte fraser og med rimelig længde.',
                  locked: false,
                },
                slug: { value: 'slug-2', locked: false },
                jsonLd: { value: { '@graph': [] }, locked: false },
              },
            },
            alternatives: [],
          },
          validation: { errors: [], warnings: [], suggestions: [] },
        }) as never,
      patchFn: async () => {
        patchCalls += 1;
        readAfterWrite = true;
      },
      publishFn: async () => {
        publishCalls += 1;
      },
    });

    expect(patchCalls).toBe(1);
    expect(publishCalls).toBe(1);
    expect(result.stoppedOnError).toBe(true);
    expect(result.errorMessage).toMatch(/Readback mismatch|backup/i);
  });
});
