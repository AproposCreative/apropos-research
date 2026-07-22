import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

import {
  assertCanAccessOwnedDoc,
  isSeoEngineAdmin,
  isSeoEngineUidAllowed,
} from '../lib/seo-engine/access';
import { requireCronSecret, requireInternalApiSecret } from '../lib/seo-engine/secret-guards';
import {
  resolveWebhookSeoHttpStatus,
  shouldAttemptSeoEnqueue,
  shouldRunImageOptimize,
} from '../lib/seo-engine/webhook-decisions';
import {
  assertWorkerMayPublishStrategy,
  buildEmptyOnlyDomainPatch,
  isFreshFetchStaleVsAnalyzed,
} from '../lib/seo-engine/auto-seo-worker';
import { buildDemoStrategyPack, buildDemoAnalysis } from '../lib/seo-engine/demo-pipeline';
import { applyDeterministicJsonLdToPack } from '../lib/seo-engine/jsonld-apply';
import { SeoStrategyPackV1Schema, SeoEngineInputContractSchema } from '../lib/seo-engine/schema';
import { computeInputVersionHash } from '../lib/seo-engine/hash';
import { buildNormalizedInputText } from '../lib/seo-engine/long-article';
import {
  assertSnapshotWithinBudget,
  estimateSnapshotByteSize,
} from '../lib/seo-engine/snapshot-budget';
import { SEO_ENGINE_SNAPSHOT_HARD_MAX_BYTES } from '../lib/seo-engine/versions';
import { runEphemeralDemoPipeline } from '../lib/seo-engine/ephemeral-pipeline';
import { filterHistoryRowsForUser, assertSameArticleKey } from '../lib/seo-engine/history';
import { buildCopyBundle, buildCopyBundleFromEditable, parseEditableString, parseRelatedAproposText } from '../lib/seo-engine/ui-helpers';
import {
  isEphemeralDemoAllowedByEnv,
  isEphemeralDemoRequest,
} from '../lib/seo-engine/ephemeral-demo';

function baseBody(n = 250) {
  return 'x'.repeat(n);
}

describe('save-fields route contract', () => {
  it('imports saveFields and does not call regenerateField', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'app/api/seo-engine/save-fields/route.ts'),
      'utf8'
    );
    expect(src).toMatch(/import\s*\{\s*saveFields\s*\}/);
    expect(src).not.toMatch(/regenerateField/);
    expect(src).toMatch(/patches/);
    expect(src).toMatch(/expectedRevision/);
    expect(src).toMatch(/adoptStrategyId/);
    // Rejects regenerate-shaped payloads (fieldPath without patches)
    expect(src).toMatch(/body\?\.fieldPath/);
    expect(src).toMatch(/brug regenerate-field/i);
  });
});

describe('cron secret spoof resistance', () => {
  const prevCron = process.env.CRON_SECRET;
  const prevNode = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;

  afterEach(() => {
    process.env.CRON_SECRET = prevCron;
    (process.env as Record<string, string | undefined>).NODE_ENV = prevNode;
    process.env.VERCEL = prevVercel;
  });

  it('rejects spoofed x-vercel-cron without bearer', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.CRON_SECRET = 'real-cron-secret';
    const spoof = new NextRequest('http://localhost/api/cron/seo-engine-recovery', {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(requireCronSecret(spoof)).toBe(false);
    const ok = new NextRequest('http://localhost/api/cron/seo-engine-recovery', {
      headers: { Authorization: 'Bearer real-cron-secret' },
    });
    expect(requireCronSecret(ok)).toBe(true);
  });
});

describe('production UID allowlist + system IDOR', () => {
  const prevAdmin = process.env.SEO_ENGINE_ADMIN_UIDS;
  const prevAllowed = process.env.SEO_ENGINE_ALLOWED_UIDS;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    process.env.SEO_ENGINE_ADMIN_UIDS = prevAdmin;
    process.env.SEO_ENGINE_ALLOWED_UIDS = prevAllowed;
    (process.env as Record<string, string | undefined>).NODE_ENV = prevNode;
  });

  it('fails closed in production when both UID lists empty', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.SEO_ENGINE_ADMIN_UIDS;
    delete process.env.SEO_ENGINE_ALLOWED_UIDS;
    expect(isSeoEngineUidAllowed('any-user')).toBe(false);
  });

  it('admin-only list is enough without ALLOWED membership', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.SEO_ENGINE_ADMIN_UIDS = 'admin-a';
    delete process.env.SEO_ENGINE_ALLOWED_UIDS;
    expect(isSeoEngineUidAllowed('admin-a')).toBe(true);
    expect(isSeoEngineAdmin('admin-a')).toBe(true);
    expect(isSeoEngineUidAllowed('user-b')).toBe(false);
  });

  it('system docs are admin-only (no allowSystem bypass)', () => {
    process.env.SEO_ENGINE_ADMIN_UIDS = 'admin-a';
    expect(() =>
      assertCanAccessOwnedDoc({ userId: 'user-b', createdBy: 'system:seo-engine-worker' })
    ).toThrow(/admin/i);
    expect(() =>
      assertCanAccessOwnedDoc({ userId: 'admin-a', createdBy: 'system:seo-engine-worker' })
    ).not.toThrow();
  });

  it('history filter hides system docs from non-admin', () => {
    process.env.SEO_ENGINE_ADMIN_UIDS = 'admin-a';
    const rows = [
      { id: '1', createdBy: 'user-b' },
      { id: '2', createdBy: 'system:seo-engine-worker' },
    ];
    expect(filterHistoryRowsForUser(rows, 'user-b').map((r) => r.id)).toEqual(['1']);
    expect(filterHistoryRowsForUser(rows, 'admin-a').map((r) => r.id)).toEqual(['1', '2']);
  });
});

describe('webhook decisions', () => {
  it('image-opt off does not block SEO enqueue decision', () => {
    const flags = {
      imageOptOn: false,
      autoSeoOn: true,
      autoTranslateOn: false,
      isPrimaryLocale: true,
      triggerType: 'collection_item_published',
    };
    expect(shouldRunImageOptimize(flags)).toBe(false);
    expect(shouldAttemptSeoEnqueue(flags)).toBe(true);
  });

  it('partial SEO enqueue failure needs 503 even if another item queued', () => {
    const http = resolveWebhookSeoHttpStatus({
      autoSeoOn: true,
      seoEngineQueued: ['job-ok'],
      seoEngineErrors: [{ itemId: 'item-fail', error: 'firestore down' }],
    });
    expect(http.status).toBe(503);
    expect(http.needsRetry).toBe(true);
    expect(http.ok).toBe(false);
  });
});

describe('worker publish guards', () => {
  it('blocks CMS write when fresh lastUpdated changed after Fase B', () => {
    expect(
      isFreshFetchStaleVsAnalyzed({
        analyzedLastUpdated: '2026-01-01T00:00:00.000Z',
        freshLastUpdated: '2026-01-01T01:00:00.000Z',
      })
    ).toBe(true);
  });

  it('blocks demo strategy from auto-worker', () => {
    expect(() => assertWorkerMayPublishStrategy({ mode: 'demo' })).toThrow(/demo/i);
    expect(() => assertWorkerMayPublishStrategy({ mode: 'ai' })).not.toThrow();
  });

  it('builds empty-only domain patch', () => {
    expect(
      buildEmptyOnlyDomainPatch({
        seoTitleEmpty: false,
        metaDescriptionEmpty: true,
        seoTitle: 'T',
        metaDescription: 'D',
      })
    ).toEqual({ metaDescription: 'D' });
  });
});

describe('jsonLd deterministic overwrite + exactly 2 alternatives', () => {
  const input = {
    editorialTitle: 'Titel',
    language: 'da' as const,
    body: baseBody(),
    intro: 'Intro tekst',
  };
  const hash = computeInputVersionHash(input);
  const { normalizedText, inputMode } = buildNormalizedInputText(input);
  const analysis = buildDemoAnalysis({ input, normalizedText, inputVersionHash: hash, inputMode });

  it('demo pack always has exactly 2 distinct alternatives', () => {
    const pack = buildDemoStrategyPack({ input, analysis });
    expect(pack.alternatives).toHaveLength(2);
    expect(pack.alternatives[0].family).not.toBe(pack.alternatives[1].family);
    expect(SeoStrategyPackV1Schema.safeParse(pack).success).toBe(true);
  });

  it('always overwrites jsonLd from final title/meta', () => {
    const pack = buildDemoStrategyPack({ input, analysis });
    pack.recommended.fields.jsonLd.value = {
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'Thing', name: 'AI hallucinated' }],
    };
    const next = applyDeterministicJsonLdToPack(pack, input, analysis);
    const graph = next.recommended.fields.jsonLd.value['@graph'] as Array<Record<string, unknown>>;
    expect(JSON.stringify(graph)).not.toContain('AI hallucinated');
    expect(graph.some((n) => n['@type'] === 'WebPage')).toBe(true);
    for (const alt of next.alternatives) {
      expect(alt.fields.jsonLd.value['@context']).toBe('https://schema.org');
    }
  });
});

describe('snapshot byte budget', () => {
  it('accepts normal short article', () => {
    const input = SeoEngineInputContractSchema.parse({
      editorialTitle: 'Kort',
      language: 'da',
      body: baseBody(300),
    });
    const { normalizedText } = buildNormalizedInputText(input);
    expect(assertSnapshotWithinBudget({ contract: input, normalizedText })).toBeLessThan(
      SEO_ENGINE_SNAPSHOT_HARD_MAX_BYTES
    );
  });

  it('rejects oversize Unicode payload before Firestore write', () => {
    // Use many multi-byte chars so byte size exceeds hard max while staying under Zod string max
    const chunk = 'æ'.repeat(50_000); // 2 bytes each in utf8 => 100k
    const body = chunk.repeat(10); // ~1MB
    const input = {
      editorialTitle: 'Oversize',
      language: 'da' as const,
      body,
    };
    const { normalizedText } = buildNormalizedInputText(input);
    const bytes = estimateSnapshotByteSize({ contract: input, normalizedText });
    expect(bytes).toBeGreaterThan(SEO_ENGINE_SNAPSHOT_HARD_MAX_BYTES);
    expect(() => assertSnapshotWithinBudget({ contract: input, normalizedText })).toThrow(
      /for stort|input_too_large/i
    );
  });
});

describe('ephemeral demo guard', () => {
  const prevDemo = process.env.SEO_ENGINE_DEMO;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    process.env.SEO_ENGINE_DEMO = prevDemo;
    (process.env as Record<string, string | undefined>).NODE_ENV = prevNode;
  });

  it('runs analyze+strategy without Firebase when demo+nonprod', () => {
    process.env.SEO_ENGINE_DEMO = 'true';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    const out = runEphemeralDemoPipeline({
      editorialTitle: 'Ephemeral',
      language: 'da',
      body: baseBody(300),
      intro: 'Intro',
    });
    expect(out.ephemeral).toBe(true);
    expect(out.mode).toBe('demo');
    expect(out.persistDisabled).toBe(true);
    expect(out.pack.alternatives).toHaveLength(2);
    expect(out.demoNotice).toMatch(/ingen Firebase/i);
  });

  it('blocks ephemeral demo in production', () => {
    process.env.SEO_ENGINE_DEMO = 'true';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    expect(() =>
      runEphemeralDemoPipeline({
        editorialTitle: 'Nope',
        language: 'da',
        body: baseBody(300),
      })
    ).toThrow(/production/i);
  });
});

describe('diff articleKey guard + copy helpers', () => {
  it('rejects diff across different articleKeys', () => {
    expect(() =>
      assertSameArticleKey({ articleKey: 'wf:a' }, { articleKey: 'wf:b' })
    ).toThrow(/articleKey/i);
  });

  it('parseEditableString throws on invalid JSON for structured fields', () => {
    expect(() => parseEditableString('jsonLd', '{not-json')).toThrow(/JSON/i);
  });

  it('buildCopyBundleFromEditable skips invalid JSON without throwing', () => {
    const { text, skipped } = buildCopyBundleFromEditable({
      seoTitle: { value: 'Ok title' },
      imageCaption: { value: '{not-json' },
    });
    expect(text).toContain('seoTitle: Ok title');
    expect(text).not.toContain('{not-json');
    expect(skipped).toContain('imageCaption');
  });

  it('parseRelatedAproposText accepts title | url lines', () => {
    const rows = parseRelatedAproposText(
      'Film A | https://example.com/a\nhttps://example.com/b\nBare titel'
    );
    expect(rows).toEqual([
      { title: 'Film A', url: 'https://example.com/a' },
      { url: 'https://example.com/b' },
      { title: 'Bare titel' },
    ]);
  });

  it('copy bundle includes seoTitle', () => {
    const bundle = buildCopyBundle({
      seoTitle: {
        value: 'T',
        rationale: '',
        confidence: 1,
        sources: ['article'],
        warnings: [],
        locked: false,
      },
    } as any);
    expect(bundle).toContain('seoTitle: T');
  });
});

describe('SeoEngineClient UI contracts (source)', () => {
  const src = readFileSync(
    path.join(process.cwd(), 'app/ai/seo/SeoEngineClient.tsx'),
    'utf8'
  );

  it('wires primary image URL + related articles into payload helpers', () => {
    expect(src).toMatch(/Primært billede URL/);
    expect(src).toMatch(/Relaterede Apropos-artikler/);
    expect(src).toMatch(/relatedAproposArticles/);
    expect(src).toMatch(/parseRelatedAproposText/);
    expect(src).toMatch(/primaryImage/);
    expect(src).toMatch(/imageUrl/);
  });

  it('shows semantic analysis + validation + checklist/risks + field warnings', () => {
    expect(src).toMatch(/primaryEntity/);
    expect(src).toMatch(/secondaryEntities/);
    expect(src).toMatch(/searchIntent/);
    expect(src).toMatch(/stanceOrVerdict/);
    expect(src).toMatch(/facts\.missing/);
    expect(src).toMatch(/validation\.errors/);
    expect(src).toMatch(/checklist/);
    expect(src).toMatch(/risks/);
    expect(src).toMatch(/st\.warnings/);
  });

  it('blocks silent overwrite of recommended when viewing alternative', () => {
    expect(src).toMatch(/Brug denne retning/);
    expect(src).toMatch(/viewingAlt/);
    expect(src).toMatch(/disabled=\{busy \|\| ephemeralMode \|\| viewingAlt\}/);
    expect(src).toMatch(/adoptStrategyId/);
  });

  it('handles invalid JSON on copy without unhandled rejection', () => {
    expect(src).toMatch(/buildCopyBundleFromEditable/);
    expect(src).not.toMatch(/buildCopyBundle\(fields/);
  });

  it('wires ephemeral demo header + banner', () => {
    expect(src).toMatch(/x-seo-engine-ephemeral-demo/);
    expect(src).toMatch(/NEXT_PUBLIC_SEO_ENGINE_DEMO/);
    expect(src).toMatch(/Ephemeral demo/);
    expect(src).toMatch(/persistDisabled|ephemeralMode/);
  });
});

describe('ephemeral demo request detection', () => {
  const prevDemo = process.env.SEO_ENGINE_DEMO;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    process.env.SEO_ENGINE_DEMO = prevDemo;
    (process.env as Record<string, string | undefined>).NODE_ENV = prevNode;
  });

  it('requires env + header or body flag', () => {
    process.env.SEO_ENGINE_DEMO = 'true';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    expect(isEphemeralDemoAllowedByEnv()).toBe(true);
    const bare = new NextRequest('http://localhost/api/seo-engine/analyze', {
      method: 'POST',
    });
    expect(isEphemeralDemoRequest(bare)).toBe(false);
    const withHeader = new NextRequest('http://localhost/api/seo-engine/analyze', {
      method: 'POST',
      headers: { 'x-seo-engine-ephemeral-demo': '1' },
    });
    expect(isEphemeralDemoRequest(withHeader)).toBe(true);
    expect(isEphemeralDemoRequest(bare, { ephemeralDemo: true })).toBe(true);
  });
});

describe('key lib pieces still present', () => {
  it('exports markAnalysisStrategyFailure and snapshot/jsonld helpers', () => {
    const storeSrc = readFileSync(path.join(process.cwd(), 'lib/seo-engine/store.ts'), 'utf8');
    expect(storeSrc).toMatch(/export async function markAnalysisStrategyFailure/);
    const accessSrc = readFileSync(path.join(process.cwd(), 'lib/seo-engine/access.ts'), 'utf8');
    expect(accessSrc).toMatch(/assertCanAccessOwnedDoc/);
    const histSrc = readFileSync(path.join(process.cwd(), 'lib/seo-engine/history.ts'), 'utf8');
    expect(histSrc).toMatch(/filterHistoryRowsForUser/);
    const workerSrc = readFileSync(
      path.join(process.cwd(), 'lib/seo-engine/auto-seo-worker.ts'),
      'utf8'
    );
    expect(workerSrc).toMatch(/assertWorkerMayPublishStrategy/);
    const jsonldSrc = readFileSync(
      path.join(process.cwd(), 'lib/seo-engine/jsonld-apply.ts'),
      'utf8'
    );
    expect(jsonldSrc).toMatch(/applyDeterministicJsonLdToPack/);
    const ephSrc = readFileSync(
      path.join(process.cwd(), 'lib/seo-engine/ephemeral-pipeline.ts'),
      'utf8'
    );
    expect(ephSrc).toMatch(/runEphemeralDemoPipeline/);
    const budgetSrc = readFileSync(
      path.join(process.cwd(), 'lib/seo-engine/snapshot-budget.ts'),
      'utf8'
    );
    expect(budgetSrc).toMatch(/assertSnapshotWithinBudget/);
  });
});

describe('internal secret still requires header', () => {
  const prev = process.env.INTERNAL_API_SECRET;
  const prevNode = process.env.NODE_ENV;
  afterEach(() => {
    process.env.INTERNAL_API_SECRET = prev;
    (process.env as Record<string, string | undefined>).NODE_ENV = prevNode;
  });
  it('rejects firebase bearer alone', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.INTERNAL_API_SECRET = 'sec';
    const req = new NextRequest('http://localhost/api/internal/seo-engine-article', {
      headers: { Authorization: 'Bearer firebase' },
    });
    expect(requireInternalApiSecret(req)).toBe(false);
  });
});
