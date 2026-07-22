/**
 * Production quality rule: analyzed/editor-chosen review types must surface
 * a clear review keyword in the recommended SEO title (word-boundary).
 *
 * DA: anmeldelse | anmeldelser
 * EN: review | reviews
 *
 * Does not require the phrase "anmeldelse af". Compound labels like
 * "Koncertanmeldelse" do NOT count — the keyword must stand alone.
 */

import type { EditorialAnalysisV1 } from '@/lib/seo-engine/schema';
import type { ValidationIssue } from '@/lib/seo-engine/validator';

export const REVIEW_SEO_ARTICLE_TYPES = [
  'Filmanmeldelse',
  'Serieanmeldelse',
  'Koncertanmeldelse',
  'Festivalanmeldelse',
  'Albumanmeldelse',
  'Spilanmeldelse',
  'Teateranmeldelse',
  'Kunstanmeldelse',
] as const;

export type ReviewSeoArticleType = (typeof REVIEW_SEO_ARTICLE_TYPES)[number];

const REVIEW_TYPE_SET = new Set(
  REVIEW_SEO_ARTICLE_TYPES.map((t) => t.toLowerCase())
);

/** DA: anmeldelse / anmeldelser as whole words. */
export const DA_REVIEW_TITLE_RE = /\banmeldelser?\b/i;

/** EN: review / reviews as whole words (does not match preview/interview). */
export const EN_REVIEW_TITLE_RE = /\breviews?\b/i;

export function normalizeArticleTypeLabel(type: string | null | undefined): string {
  return (type || '').trim();
}

export function isReviewSeoArticleType(type: string | null | undefined): boolean {
  const n = normalizeArticleTypeLabel(type).toLowerCase();
  return n.length > 0 && REVIEW_TYPE_SET.has(n);
}

/**
 * Prefer editor-chosen type when present; otherwise suggested.
 * Matches production UI: editor override wins for quality gates.
 */
export function resolveEffectiveArticleType(
  analysis: Pick<EditorialAnalysisV1, 'articleType'> | null | undefined,
  fallbackType?: string | null
): string {
  const editor = normalizeArticleTypeLabel(analysis?.articleType?.editor);
  if (editor) return editor;
  const suggested = normalizeArticleTypeLabel(analysis?.articleType?.suggested);
  if (suggested) return suggested;
  return normalizeArticleTypeLabel(fallbackType);
}

export function isDaLanguage(language: string | null | undefined): boolean {
  const lang = (language || 'da').trim().toLowerCase();
  return lang === 'da' || lang === 'dk' || lang.startsWith('da');
}

export function isEnLanguage(language: string | null | undefined): boolean {
  const lang = (language || '').trim().toLowerCase();
  return lang === 'en' || lang.startsWith('en');
}

export function seoTitleHasReviewKeyword(
  seoTitle: string | null | undefined,
  language: string | null | undefined
): boolean {
  const title = (seoTitle || '').trim();
  if (!title) return false;
  if (isEnLanguage(language)) return EN_REVIEW_TITLE_RE.test(title);
  // Default / DA path
  return DA_REVIEW_TITLE_RE.test(title);
}

export function requiredReviewKeywordLabel(language: string | null | undefined): string {
  return isEnLanguage(language) ? 'review|reviews' : 'anmeldelse|anmeldelser';
}

export type ReviewTitleCheck = {
  applies: boolean;
  ok: boolean;
  effectiveArticleType: string;
  requiredKeyword: string;
  message?: string;
};

export function checkReviewSeoTitle(args: {
  seoTitle: string | null | undefined;
  language: string | null | undefined;
  articleType: string | null | undefined;
}): ReviewTitleCheck {
  const effectiveArticleType = normalizeArticleTypeLabel(args.articleType);
  const requiredKeyword = requiredReviewKeywordLabel(args.language);
  if (!isReviewSeoArticleType(effectiveArticleType)) {
    return {
      applies: false,
      ok: true,
      effectiveArticleType,
      requiredKeyword,
    };
  }
  if (seoTitleHasReviewKeyword(args.seoTitle, args.language)) {
    return {
      applies: true,
      ok: true,
      effectiveArticleType,
      requiredKeyword,
    };
  }
  return {
    applies: true,
    ok: false,
    effectiveArticleType,
    requiredKeyword,
    message: `Review-type "${effectiveArticleType}" kræver SEO-title med ordgrænse-match på ${requiredKeyword}`,
  };
}

export function reviewSeoTitleValidationError(args: {
  seoTitle: string | null | undefined;
  language: string | null | undefined;
  articleType: string | null | undefined;
}): ValidationIssue | null {
  const check = checkReviewSeoTitle(args);
  if (!check.applies || check.ok) return null;
  return {
    code: 'review_title_keyword_missing',
    message: check.message || 'Manglende review-keyword i seoTitle',
    fieldPath: 'seoTitle',
  };
}

/** Natural entity-first demo/fallback titles — never blind-truncate away the keyword. */
export function buildReviewAwareDemoSeoTitle(args: {
  entity: string;
  language: string | null | undefined;
  articleType: string | null | undefined;
  maxLen: number;
}): string {
  const entity = (args.entity || '').trim() || 'Artikel';
  if (!isReviewSeoArticleType(args.articleType)) {
    return truncateAtWordBoundary(entity, args.maxLen);
  }
  const keyword = isEnLanguage(args.language) ? 'review' : 'anmeldelse';
  const full = `${entity} ${keyword}`;
  if (full.length <= args.maxLen) return full;
  // Prefer keeping the keyword; shorten entity side only.
  const budget = Math.max(8, args.maxLen - keyword.length - 1);
  const shortEntity = truncateAtWordBoundary(entity, budget);
  const rebuilt = `${shortEntity} ${keyword}`.trim();
  if (rebuilt.length <= args.maxLen && seoTitleHasReviewKeyword(rebuilt, args.language)) {
    return rebuilt;
  }
  // Last resort: keyword alone is invalid; return full and let validator block.
  return full;
}

function truncateAtWordBoundary(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const sliced = t.slice(0, max);
  const sp = sliced.lastIndexOf(' ');
  if (sp >= Math.floor(max * 0.5)) return sliced.slice(0, sp).trim();
  return sliced.trim();
}
