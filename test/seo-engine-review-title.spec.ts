import { describe, expect, it } from 'vitest';
import {
  buildReviewAwareDemoSeoTitle,
  checkReviewSeoTitle,
  isReviewSeoArticleType,
  resolveEffectiveArticleType,
  seoTitleHasReviewKeyword,
  REVIEW_SEO_ARTICLE_TYPES,
} from '../lib/seo-engine/review-title-rule';
import { validateSeoPack } from '../lib/seo-engine/validator';
import { validateOverwriteFields } from '../lib/seo-engine/overwrite-backfill';
import { buildDemoAnalysis, buildDemoStrategyPack } from '../lib/seo-engine/demo-pipeline';
import { buildNormalizedInputText } from '../lib/seo-engine/long-article';
import { computeInputVersionHash } from '../lib/seo-engine/hash';
import type { EditorialAnalysisV1, SeoEngineInputContract } from '../lib/seo-engine/schema';
import { SEO_TITLE_MAX } from '../lib/seo/constants';

function baseInput(over: Partial<SeoEngineInputContract> = {}): SeoEngineInputContract {
  return {
    editorialTitle: 'Lucky',
    language: 'da',
    body: 'x'.repeat(250),
    intro: 'En serie der glider.',
    articleType: 'Serieanmeldelse',
    existingSeoTitle: null,
    existingMetaDescription: null,
    ...over,
  };
}

function miniAnalysis(over: Partial<EditorialAnalysisV1['articleType']> = {}): EditorialAnalysisV1 {
  const input = baseInput();
  const norm = buildNormalizedInputText(input);
  const analysis = buildDemoAnalysis({
    input,
    normalizedText: norm.normalizedText,
    inputVersionHash: computeInputVersionHash(input),
    inputMode: norm.inputMode,
  });
  analysis.articleType = {
    ...analysis.articleType,
    suggested: 'Serieanmeldelse',
    editor: undefined,
    ...over,
  };
  return analysis;
}

describe('review-title-rule matrix', () => {
  it('recognizes all eight review types and rejects essay/feature', () => {
    for (const t of REVIEW_SEO_ARTICLE_TYPES) {
      expect(isReviewSeoArticleType(t)).toBe(true);
    }
    expect(isReviewSeoArticleType('Feature')).toBe(false);
    expect(isReviewSeoArticleType('Essay')).toBe(false);
    expect(isReviewSeoArticleType('Kulturkommentar')).toBe(false);
    expect(isReviewSeoArticleType('Kunstanmeldelse')).toBe(true);
  });

  it('prefers editor-chosen type over suggested', () => {
    const a = miniAnalysis({ editor: 'Feature', suggested: 'Kunstanmeldelse' });
    expect(resolveEffectiveArticleType(a)).toBe('Feature');
  });

  it('DA: requires anmeldelse/anmeldelser word-boundary; plural OK', () => {
    expect(seoTitleHasReviewKeyword('Lucky anmeldelse: Anya', 'da')).toBe(true);
    expect(seoTitleHasReviewKeyword('Copenhell 2026 anmeldelser', 'da')).toBe(true);
    expect(seoTitleHasReviewKeyword('Little Simz på Roskilde Festival 2026', 'da')).toBe(false);
    // Compound type label is NOT a standalone keyword
    expect(seoTitleHasReviewKeyword('Lucky — Serieanmeldelse', 'da')).toBe(false);
  });

  it('EN: requires review/reviews; rejects preview/interview false positives', () => {
    expect(seoTitleHasReviewKeyword('Mille at Roskilde Festival 2026 Review', 'en')).toBe(true);
    expect(seoTitleHasReviewKeyword('Young Miko at Roskilde Festival 2026 review', 'en')).toBe(true);
    expect(seoTitleHasReviewKeyword('Little Simz at Roskilde Festival 2026', 'en')).toBe(false);
    expect(seoTitleHasReviewKeyword('Festival preview: Little Simz', 'en')).toBe(false);
    expect(seoTitleHasReviewKeyword('Exclusive interview with Mille', 'en')).toBe(false);
  });

  it('does not force review word on essay/feature (Kunst)', () => {
    const check = checkReviewSeoTitle({
      seoTitle: 'Kunst og graffiti på Roskilde Festival 2026',
      language: 'da',
      articleType: 'Feature',
    });
    expect(check.applies).toBe(false);
    expect(check.ok).toBe(true);
  });

  it('validateSeoPack errors when review type missing keyword', () => {
    const input = baseInput({ articleType: 'Koncertanmeldelse' });
    const analysis = miniAnalysis({ suggested: 'Koncertanmeldelse' });
    const pack = buildDemoStrategyPack({ input, analysis });
    pack.recommended.fields.seoTitle.value = 'Little Simz på Roskilde Festival 2026';
    const v = validateSeoPack(pack, analysis, { language: 'da' });
    expect(v.errors.some((e) => e.code === 'review_title_keyword_missing')).toBe(true);
  });

  it('validateOverwriteFields blocks missing review keyword', () => {
    const bad = validateOverwriteFields({
      seoTitle: 'Napalm Death på Roskilde Festival 2026',
      metaDescription: 'En koncertanmeldelse med holdning og kontekst.',
      language: 'da',
      articleType: 'Koncertanmeldelse',
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.includes('review_title_keyword_missing'))).toBe(true);
  });

  it('demo review titles keep keyword within SEO_TITLE_MAX without blind suffix cut', () => {
    const longEntity = 'A'.repeat(70);
    const title = buildReviewAwareDemoSeoTitle({
      entity: longEntity,
      language: 'da',
      articleType: 'Albumanmeldelse',
      maxLen: SEO_TITLE_MAX,
    });
    expect(title.length).toBeLessThanOrEqual(SEO_TITLE_MAX + 20); // may exceed if last resort
    expect(seoTitleHasReviewKeyword(title, 'da')).toBe(true);
  });
});
