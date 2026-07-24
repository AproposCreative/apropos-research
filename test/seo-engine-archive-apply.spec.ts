import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ARCHIVE_APPLY_MAX_BATCH,
  ARCHIVE_APPLY_WEBFLOW_BUSY_DA,
  assertArchiveApplyConfirmGates,
  assertArchiveApplySelectionGates,
  applyArchiveApplyPreview,
  createCachedLocaleFetch,
  createMemoryArchiveApplyPreviewStore,
  formatArchiveApplyFetchError,
  generateArchiveApplyPreview,
  normalizeArchiveApplySelection,
  sortSelectionDaFirst,
  type ArchiveApplyPreviewDocument,
} from '../lib/seo-engine/archive-audit-apply';
import type { FrozenManifestEntry, SourceSignature } from '../lib/seo-engine/overwrite-backfill';
import { WebflowLocaleFetchError } from '../lib/webflow/locale-items';

const body = `<p>${'ord '.repeat(80)}</p>`;

function sig(partial?: Partial<SourceSignature>): SourceSignature {
  return {
    lastUpdated: '2026-07-01T00:00:00.000Z',
    lastPublished: '2026-07-01T00:00:00.000Z',
    contentHash: 'content-hash',
    inputVersionHash: 'input-hash',
    oldSeoTitle: 'Gammel titel',
    oldMetaDescription: 'Gammel meta description der er lang nok.',
    ...partial,
  };
}

function baseManifestEntry(
  partial?: Partial<FrozenManifestEntry>
): FrozenManifestEntry {
  return {
    itemId: 'item1',
    locale: 'da',
    cmsLocaleId: 'dk-locale',
    articleKey: 'wf:item1:da',
    newSeoTitle: 'Ny SEO titel om Artikel',
    newMetaDescription:
      'Ny meta description om Artikel uden forbudte fraser og med rimelig længde.',
    wasPublished: true,
    sourceSignature: sig(),
    ...partial,
  };
}

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

function publishedItem(fieldData: Record<string, unknown> = {}) {
  return {
    id: 'item1',
    cmsLocaleId: 'dk-locale',
    lastPublished: '2026-07-01T00:00:00.000Z',
    lastUpdated: '2026-07-01T00:00:00.000Z',
    isDraft: false,
    fieldData: {
      name: 'Artikel',
      slug: 'artikel',
      content: body,
      'seo-title': 'Gammel titel',
      'meta-description': 'Gammel meta description der er lang nok.',
      ...fieldData,
    },
  };
}

describe('archive-apply selection gates', () => {
  it('blocks empty selection', () => {
    const gate = assertArchiveApplySelectionGates([]);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/Ingen valgte/i);
  });

  it('blocks over max batch size', () => {
    const selection = Array.from({ length: ARCHIVE_APPLY_MAX_BATCH + 1 }, (_, i) => ({
      itemId: `id-${i}`,
      locale: 'da' as const,
    }));
    const gate = assertArchiveApplySelectionGates(selection);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/Max/);
  });

  it('accepts within max batch', () => {
    const selection = Array.from({ length: 3 }, (_, i) => ({
      itemId: `id-${i}`,
      locale: (i % 2 === 0 ? 'da' : 'en') as 'da' | 'en',
    }));
    expect(assertArchiveApplySelectionGates(selection)).toEqual({ ok: true });
  });

  it('normalizes and de-dupes selection', () => {
    const n = normalizeArchiveApplySelection([
      { itemId: 'a', locale: 'en' },
      { itemId: 'a', locale: 'en' },
      { itemId: 'b', locale: 'da' },
    ]);
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.selection).toEqual([
        { itemId: 'b', locale: 'da' },
        { itemId: 'a', locale: 'en' },
      ]);
    }
  });

  it('sorts DA before EN', () => {
    expect(
      sortSelectionDaFirst([
        { itemId: 'x', locale: 'en' },
        { itemId: 'y', locale: 'da' },
      ])
    ).toEqual([
      { itemId: 'y', locale: 'da' },
      { itemId: 'x', locale: 'en' },
    ]);
  });
});

describe('archive-apply confirm gates', () => {
  const preview: ArchiveApplyPreviewDocument = {
    schemaVersion: 1,
    previewId: 'aap-1',
    confirmToken: 'token-abc',
    createdAt: new Date().toISOString(),
    createdBy: 'admin',
    mode: 'dry-run',
    selection: [{ itemId: 'item1', locale: 'da' }],
    limit: 1,
    locales: ['da'],
    backupPath: null,
    stoppedOnError: false,
    errorMessage: null,
    results: [
      {
        itemId: 'item1',
        slug: 'artikel',
        title: 'Artikel',
        locales: [
          {
            locale: 'da',
            status: 'proposed',
            proposal: {
              locale: 'da',
              cmsLocaleId: 'dk-locale',
              articleKey: 'wf:item1:da',
              title: 'Artikel',
              slug: 'artikel',
              wasPublished: true,
              oldSeoTitle: 'Gammel',
              oldMetaDescription: 'Gammel meta',
              newSeoTitle: 'Ny SEO titel om Artikel',
              newMetaDescription:
                'Ny meta description om Artikel uden forbudte fraser og med rimelig længde.',
              analysisRunId: 'ar1',
              seoVersionId: 'sv1',
              mode: 'ai',
              validationErrors: [],
              validationWarnings: [],
              sourceSignature: sig(),
              effectiveArticleType: 'feature',
            },
          },
        ],
      },
    ],
    frozenManifest: [baseManifestEntry()],
    proposals: [],
    rejected: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    appliedAt: null,
  };

  it('rejects apply without previewId', () => {
    const gate = assertArchiveApplyConfirmGates({
      confirmOverwrite: true,
      confirmToken: 'token-abc',
      preview,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/previewId/i);
  });

  it('rejects apply without confirmOverwrite', () => {
    const gate = assertArchiveApplyConfirmGates({
      previewId: 'aap-1',
      confirmOverwrite: false,
      confirmToken: 'token-abc',
      preview,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/confirmOverwrite/i);
  });

  it('rejects apply without confirmToken', () => {
    const gate = assertArchiveApplyConfirmGates({
      previewId: 'aap-1',
      confirmOverwrite: true,
      confirmToken: '',
      preview,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/confirmToken/i);
  });

  it('rejects mismatched confirmToken', () => {
    const gate = assertArchiveApplyConfirmGates({
      previewId: 'aap-1',
      confirmOverwrite: true,
      confirmToken: 'wrong',
      preview,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/matcher ikke/i);
  });

  it('rejects already-applied preview', () => {
    const gate = assertArchiveApplyConfirmGates({
      previewId: 'aap-1',
      confirmOverwrite: true,
      confirmToken: 'token-abc',
      preview: { ...preview, appliedAt: new Date().toISOString() },
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/allerede anvendt/i);
  });

  it('accepts valid confirm from frozen preview', () => {
    expect(
      assertArchiveApplyConfirmGates({
        previewId: 'aap-1',
        confirmOverwrite: true,
        confirmToken: 'token-abc',
        preview,
      })
    ).toEqual({ ok: true });
  });
});

describe('archive-apply preview + apply flow', () => {
  it('preview writes no CMS patches and returns confirmToken', async () => {
    const store = createMemoryArchiveApplyPreviewStore();
    const patchFn = vi.fn(async () => undefined);
    const preview = await generateArchiveApplyPreview({
      selection: [{ itemId: 'item1', locale: 'da' }],
      createdBy: 'admin-1',
      store,
      fetchFn: async () => publishedItem() as never,
      analyzeFn: aiAnalyze(),
      proposeSeoMetaFn: async () => ({ seoTitle: 'Ny SEO titel om Artikel', metaDescription: 'En meta-beskrivelse der er lang nok til at bestå validering for Arkiv apply.', articleTypeHint: null, mode: 'ai' as const }),
      previewPaceMs: 0,
    });

    expect(preview.confirmToken.length).toBeGreaterThan(10);
    expect(preview.previewId.startsWith('aap-')).toBe(true);
    expect(preview.mode).toBe('dry-run');
    expect(preview.proposals).toHaveLength(1);
    expect(preview.frozenManifest).toHaveLength(1);
    expect(patchFn).not.toHaveBeenCalled();

    const loaded = await store.get(preview.previewId);
    expect(loaded?.confirmToken).toBe(preview.confirmToken);
  });

  it('preview retries 429 then succeeds for single item', async () => {
    const store = createMemoryArchiveApplyPreviewStore();
    let calls = 0;
    const retries: number[] = [];
    const preview = await generateArchiveApplyPreview({
      selection: [{ itemId: 'item1', locale: 'da' }],
      createdBy: 'admin-1',
      store,
      fetchFn: async () => {
        calls += 1;
        if (calls < 3) throw new WebflowLocaleFetchError('Too Many Requests', 429, 20);
        return publishedItem() as never;
      },
      analyzeFn: aiAnalyze(),
      proposeSeoMetaFn: async () => ({ seoTitle: 'Ny SEO titel om Artikel', metaDescription: 'En meta-beskrivelse der er lang nok til at bestå validering for Arkiv apply.', articleTypeHint: null, mode: 'ai' as const }),
      previewPaceMs: 0,
      sleep: async () => undefined,
      transientRetry: {
        maxAttempts: 5,
        baseDelayMs: 1,
        maxDelayMs: 50,
        sleep: async () => undefined,
        onRetry: (info) => retries.push(info.attempt),
      },
    });

    expect(calls).toBe(3);
    expect(retries).toEqual([1, 2]);
    expect(preview.stoppedOnError).toBe(false);
    expect(preview.proposals).toHaveLength(1);
    expect(preview.errorMessage).toBeNull();
  });

  it('preview maps exhausted 429 to Danish busy message and clears proposals', async () => {
    const store = createMemoryArchiveApplyPreviewStore();
    const preview = await generateArchiveApplyPreview({
      selection: [{ itemId: 'item1', locale: 'da' }],
      createdBy: 'admin-1',
      store,
      fetchFn: async () => {
        throw new WebflowLocaleFetchError('Too Many Requests', 429, 10);
      },
      analyzeFn: aiAnalyze(),
      proposeSeoMetaFn: async () => ({ seoTitle: 'Ny SEO titel om Artikel', metaDescription: 'En meta-beskrivelse der er lang nok til at bestå validering for Arkiv apply.', articleTypeHint: null, mode: 'ai' as const }),
      previewPaceMs: 0,
      sleep: async () => undefined,
      transientRetry: {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 20,
        sleep: async () => undefined,
      },
    });

    expect(preview.stoppedOnError).toBe(true);
    expect(preview.proposals).toHaveLength(0);
    expect(preview.frozenManifest).toHaveLength(0);
    expect(preview.errorMessage).toBe(ARCHIVE_APPLY_WEBFLOW_BUSY_DA);
    expect(preview.selection).toHaveLength(1);
  });

  it('createCachedLocaleFetch reuses successful fetch per id+locale', async () => {
    let calls = 0;
    const cached = createCachedLocaleFetch(async () => {
      calls += 1;
      return publishedItem() as never;
    });
    await cached('item1', 'dk-locale');
    await cached('item1', 'dk-locale');
    await cached('item1', 'en-locale');
    expect(calls).toBe(2);
  });

  it('formatArchiveApplyFetchError uses Danish busy copy for 429', () => {
    expect(
      formatArchiveApplyFetchError({
        itemId: 'x',
        locale: 'da',
        message: 'Too Many Requests',
        status: 429,
      })
    ).toBe(ARCHIVE_APPLY_WEBFLOW_BUSY_DA);
    expect(
      formatArchiveApplyFetchError({
        itemId: 'x',
        locale: 'da',
        message: 'auth failed',
        status: 401,
      })
    ).toMatch(/Blocking fetch/);
  });

  it('apply refuses without matching confirm token even if overwrite true', async () => {
    const store = createMemoryArchiveApplyPreviewStore();
    const preview = await generateArchiveApplyPreview({
      selection: [{ itemId: 'item1', locale: 'da' }],
      createdBy: 'admin-1',
      store,
      fetchFn: async () => publishedItem() as never,
      analyzeFn: aiAnalyze(),
      proposeSeoMetaFn: async () => ({ seoTitle: 'Ny SEO titel om Artikel', metaDescription: 'En meta-beskrivelse der er lang nok til at bestå validering for Arkiv apply.', articleTypeHint: null, mode: 'ai' as const }),
      previewPaceMs: 0,
    });

    await expect(
      applyArchiveApplyPreview({
        previewId: preview.previewId,
        confirmOverwrite: true,
        confirmToken: 'not-the-token',
        store,
        pauseAutoTranslate: false,
        reportDir: mkdtempSync(join(tmpdir(), 'aap-')),
      })
    ).rejects.toThrow(/confirmToken/i);
  });

  it('apply writes SEO fields from frozen preview with backup', async () => {
    const store = createMemoryArchiveApplyPreviewStore();
    const reportDir = mkdtempSync(join(tmpdir(), 'aap-'));
    let live = publishedItem();
    const patchFn = vi.fn(async (_id: string, fieldData: Record<string, unknown>) => {
      live = {
        ...live,
        fieldData: { ...live.fieldData, ...fieldData },
        lastUpdated: new Date().toISOString(),
      };
    });
    const publishFn = vi.fn(async () => undefined);
    let autoTranslate = true;
    const setAT = vi.fn(async (v: boolean) => {
      autoTranslate = v;
    });

    const preview = await generateArchiveApplyPreview({
      selection: [{ itemId: 'item1', locale: 'da' }],
      createdBy: 'admin-1',
      store,
      fetchFn: async () => live as never,
      analyzeFn: aiAnalyze(),
      proposeSeoMetaFn: async () => ({ seoTitle: 'Ny SEO titel om Artikel', metaDescription: 'En meta-beskrivelse der er lang nok til at bestå validering for Arkiv apply.', articleTypeHint: null, mode: 'ai' as const }),
      previewPaceMs: 0,
    });

    // Freeze live signature to match preview (patch changes lastUpdated)
    live = publishedItem();

    const result = await applyArchiveApplyPreview({
      previewId: preview.previewId,
      confirmOverwrite: true,
      confirmToken: preview.confirmToken,
      store,
      fetchFn: async () => live as never,
      patchFn: patchFn as never,
      publishFn: publishFn as never,
      reportDir,
      pauseAutoTranslate: true,
      resolveAutoTranslate: async () => true,
      setAutoTranslate: setAT,
      writePaceMs: 0,
    });

    expect(result.stoppedOnError).toBe(false);
    expect(result.writtenCount).toBe(1);
    expect(patchFn).toHaveBeenCalledTimes(1);
    expect(publishFn).toHaveBeenCalledTimes(1);
    expect(result.backupPath).toBeTruthy();
    expect(result.autoTranslatePaused).toBe(true);
    expect(result.autoTranslateRestored).toBe(true);
    expect(autoTranslate).toBe(true);
    expect(setAT.mock.calls.map((c) => c[0])).toEqual([false, true]);

    const after = await store.get(preview.previewId);
    expect(after?.appliedAt).toBeTruthy();
  });
});
