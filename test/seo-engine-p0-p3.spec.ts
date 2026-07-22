import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  listSeoEnginePromptIds,
  loadSeoEnginePrompt,
  loadEditorialAnalysisJsonSchema,
  loadSeoStrategyPackJsonSchema,
  buildAnalyzeSystemPrompt,
  clearSeoEnginePromptCache,
} from '../lib/seo-engine/prompts';
import { EditorialAnalysisV1Schema } from '../lib/seo-engine/schema';
import {
  verifyEvidenceAgainstSnapshot,
  applyEvidenceConfidencePenalty,
} from '../lib/seo-engine/evidence';
import { hashQuote } from '../lib/seo-engine/hash';
import { buildDemoAnalysis } from '../lib/seo-engine/demo-pipeline';
import { buildNormalizedInputText } from '../lib/seo-engine/long-article';
import type { SeoEngineInputContract } from '../lib/seo-engine/schema';
import { computeInputVersionHash } from '../lib/seo-engine/hash';
import {
  assertCanAccessOwnedDoc,
  isSeoEngineAdmin,
  resolveStableArticleKey,
} from '../lib/seo-engine/access';
import { requireInternalApiSecret, requireCronSecret } from '../lib/seo-engine/secret-guards';
import { NextRequest } from 'next/server';
import {
  buildCopyBundle,
  parseEditableString,
  selectDiffPair,
} from '../lib/seo-engine/ui-helpers';
import { buildProvisionalJobId } from '../lib/seo-engine/jobs';
import { cmsSeoEmptiness } from '../lib/seo-engine/cms-contract';
import { toWebflowSeoPatch } from '../lib/seo-engine/webflow-adapter';
import {
  shouldAttemptSeoEnqueue,
  shouldRunImageOptimize,
} from '../lib/seo-engine/webhook-decisions';

describe('seo-engine prompts + schema loading', () => {
  beforeEach(() => clearSeoEnginePromptCache());

  it('loads all versioned prompt modules 00–06', () => {
    const ids = listSeoEnginePromptIds();
    expect(ids).toContain('00-system-policy');
    expect(ids).toContain('01-analyze');
    expect(ids).toContain('06-editor-instructions');
    for (const id of ids) {
      const text = loadSeoEnginePrompt(id);
      expect(text.length).toBeGreaterThan(40);
    }
  });

  it('system analyze prompt includes policy and does not hardcode article body', () => {
    const sys = buildAnalyzeSystemPrompt();
    expect(sys).toContain('UNTRUSTED');
    expect(sys).toContain('PROMPT_VERSION=');
    expect(sys).not.toMatch(/x{200}/);
  });

  it('loads JSON schemas used for structured output', () => {
    const a = loadEditorialAnalysisJsonSchema();
    const b = loadSeoStrategyPackJsonSchema();
    expect(a.$id).toBe('EditorialAnalysisV1');
    expect(b.$id).toBe('SeoStrategyPackV1');
    expect(EditorialAnalysisV1Schema).toBeTruthy();
  });
});

describe('seo-engine evidence verification', () => {
  const input: SeoEngineInputContract = {
    editorialTitle: 'Testfilm',
    language: 'da',
    body: 'Dette er en lang nok brødtekst til evidence. '.repeat(10),
  };
  const hash = computeInputVersionHash(input);
  const { normalizedText } = buildNormalizedInputText(input);

  it('accepts demo evidence against snapshot', () => {
    const analysis = buildDemoAnalysis({
      input,
      normalizedText,
      inputVersionHash: hash,
      inputMode: 'full',
    });
    const v = verifyEvidenceAgainstSnapshot({
      analysis,
      normalizedText,
      inputVersionHash: hash,
    });
    expect(v.invalidEvidenceCount).toBe(0);
    expect(v.validEvidenceCount).toBeGreaterThan(0);
  });

  it('rejects bad offsets and downgrades confidence', () => {
    const analysis = buildDemoAnalysis({
      input,
      normalizedText,
      inputVersionHash: hash,
      inputMode: 'full',
    });
    analysis.primaryEntity.evidence = [
      {
        quote: 'ikke-i-teksten-xyz',
        startOffset: 0,
        endOffset: 5,
        quoteHash: hashQuote('ikke-i-teksten-xyz'),
        articleVersionHash: hash,
      },
    ];
    const before = analysis.primaryEntity.confidence;
    const v = verifyEvidenceAgainstSnapshot({
      analysis,
      normalizedText,
      inputVersionHash: hash,
    });
    expect(v.invalidEvidenceCount).toBeGreaterThan(0);
    const penalized = applyEvidenceConfidencePenalty(v.analysis, v.invalidEvidenceCount);
    expect(penalized.primaryEntity.confidence).toBeLessThanOrEqual(before);
  });
});

describe('seo-engine access + secrets', () => {
  const prevAdmin = process.env.SEO_ENGINE_ADMIN_UIDS;
  const prevInternal = process.env.INTERNAL_API_SECRET;
  const prevCron = process.env.CRON_SECRET;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    process.env.SEO_ENGINE_ADMIN_UIDS = prevAdmin;
    process.env.INTERNAL_API_SECRET = prevInternal;
    process.env.CRON_SECRET = prevCron;
    (process.env as Record<string, string | undefined>).NODE_ENV = prevNode;
  });

  it('enforces ownership unless admin', () => {
    process.env.SEO_ENGINE_ADMIN_UIDS = 'admin1';
    expect(() =>
      assertCanAccessOwnedDoc({ userId: 'u1', createdBy: 'u1' })
    ).not.toThrow();
    expect(() =>
      assertCanAccessOwnedDoc({ userId: 'u2', createdBy: 'u1' })
    ).toThrow();
    expect(() =>
      assertCanAccessOwnedDoc({ userId: 'admin1', createdBy: 'u1' })
    ).not.toThrow();
    expect(isSeoEngineAdmin('admin1')).toBe(true);
  });

  it('blocks system docs for non-admin', () => {
    process.env.SEO_ENGINE_ADMIN_UIDS = 'admin1';
    expect(() =>
      assertCanAccessOwnedDoc({ userId: 'u1', createdBy: 'system:worker' })
    ).toThrow();
  });

  it('resolves stable wf articleKey for workers', () => {
    expect(
      resolveStableArticleKey({
        webflowItemId: 'abc',
        inputVersionHash: 'hhhh',
      })
    ).toBe('wf:abc');
    expect(
      resolveStableArticleKey({
        articleKey: 'draft:x',
        inputVersionHash: 'hhhh',
      })
    ).toBe('draft:x');
  });

  it('internal secret rejects firebase-only style missing header', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.INTERNAL_API_SECRET = 'secret-internal';
    const req = new NextRequest('http://localhost/api/internal/seo-engine-article', {
      headers: { Authorization: 'Bearer firebase-token' },
    });
    expect(requireInternalApiSecret(req)).toBe(false);
    const ok = new NextRequest('http://localhost/api/internal/seo-engine-article', {
      headers: { 'x-internal-api-secret': 'secret-internal' },
    });
    expect(requireInternalApiSecret(ok)).toBe(true);
  });

  it('cron secret requires bearer and rejects vercel-cron spoof', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.CRON_SECRET = 'cron-secret';
    process.env.VERCEL = '1';
    const spoof = new NextRequest('http://localhost/api/cron/seo-engine-recovery', {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(requireCronSecret(spoof)).toBe(false);
    const ok = new NextRequest('http://localhost/api/cron/seo-engine-recovery', {
      headers: { Authorization: 'Bearer cron-secret' },
    });
    expect(requireCronSecret(ok)).toBe(true);
  });
});

describe('seo-engine worker/cms contracts', () => {
  it('provisional job id format', () => {
    const id = buildProvisionalJobId('item1', '2026-01-01T00:00:00.000Z');
    expect(id.startsWith('item1_')).toBe(true);
    expect(id).toContain('2026-01-01');
  });

  it('empty-only patch: both filled / one empty / none', () => {
    const both = cmsSeoEmptiness({
      'seo-title': 'T',
      'meta-description': 'D',
    });
    expect(both.anyEmpty).toBe(false);

    const one = cmsSeoEmptiness({
      'seo-title': 'T',
      'meta-description': '',
    });
    expect(one.seoTitleEmpty).toBe(false);
    expect(one.metaDescriptionEmpty).toBe(true);

    const patch = toWebflowSeoPatch({ metaDescription: 'Ny' });
    expect(patch['meta-description'] || patch['seo-description']).toBeTruthy();
    expect(Object.keys(toWebflowSeoPatch({}))).toHaveLength(0);
  });
});

describe('seo-engine UI helpers', () => {
  it('copy bundle and parse editable arrays', () => {
    const bundle = buildCopyBundle({
      seoTitle: {
        value: 'Titel',
        rationale: '',
        confidence: 1,
        sources: ['article'],
        warnings: [],
        locked: false,
      },
    } as any);
    expect(bundle).toContain('seoTitle: Titel');
    expect(parseEditableString('tags', 'a, b')).toEqual(['a', 'b']);
  });

  it('selects two distinct versions for diff', () => {
    const pair = selectDiffPair(['v1', 'v2', 'v3'], 'v1', 'v1');
    expect(pair.a).toBe('v1');
    expect(pair.b).toBe('v2');
  });
});

describe('seo-engine webhook flag decoupling (logic)', () => {
  it('image-opt off does not block SEO enqueue helper', () => {
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
});
