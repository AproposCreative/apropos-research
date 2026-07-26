/**
 * Safe metadata proposals — reuse SEO Engine rules (review intent, forbidden phrases,
 * article type, entity, language). Never editorial fields. No naive query-append stuffing.
 */

import type {
  OpportunityEvidence,
  OpportunityProposal,
  OpportunitySignalKind,
} from '@/lib/seo-engine/opportunity-engine/types';
import {
  OPPORTUNITY_META_MAX,
  OPPORTUNITY_META_MIN,
  OPPORTUNITY_SEO_TITLE_MAX,
} from '@/lib/seo-engine/opportunity-engine/constants';
import { isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
import {
  checkReviewSeoTitle,
  isReviewSeoArticleType,
} from '@/lib/seo-engine/review-title-rule';
import { findForbiddenPhrases } from '@/lib/seo-engine/forbidden-phrases';
import { proposeArchiveSeoMetaHeuristic } from '@/lib/seo-engine/archive-seo-meta-agent';

/**
 * Build concrete, evidence-based metadata suggestions.
 */
export function buildSafeMetadataProposals(args: {
  title: string;
  signals: OpportunitySignalKind[];
  evidence: OpportunityEvidence;
  language?: 'da' | 'en';
  articleType?: string | null;
  workName?: string | null;
  bodyExcerpt?: string | null;
}): OpportunityProposal[] {
  const proposals: OpportunityProposal[] = [];
  const query = (args.evidence.query || '').trim();
  const currentTitle = args.evidence.currentSeoTitle;
  const currentMeta = args.evidence.currentMetaDescription;
  const lang = args.language || 'da';
  const isReview = isReviewSeoArticleType(args.articleType);

  const needsTitle =
    args.signals.includes('weak_or_missing_meta') ||
    args.signals.includes('high_impressions_low_ctr') ||
    args.signals.includes('position_4_to_20') ||
    args.signals.includes('rising_query');

  const needsMeta =
    args.signals.includes('weak_or_missing_meta') ||
    args.signals.includes('high_impressions_low_ctr') ||
    args.signals.includes('declining_article');

  if (!needsTitle && !needsMeta) return proposals;

  // Reuse archive/SEO Engine heuristic (review keyword, length, tone) — not query-append.
  const crafted = proposeArchiveSeoMetaHeuristic({
    title: args.workName?.trim() || args.title,
    bodyText: args.bodyExcerpt || undefined,
    language: lang,
    articleType: args.articleType,
    oldSeoTitle: isCmsSeoFieldEmpty(currentTitle) ? null : String(currentTitle),
    oldMetaDescription: isCmsSeoFieldEmpty(currentMeta) ? null : String(currentMeta),
  });

  let seoTitle = crafted.seoTitle;
  let metaDescription = crafted.metaDescription;

  // For CTR opportunities with a clear entity query: prefer natural review/entity title
  // over stuffing the raw query string into an already-strong template.
  if (isReview && query) {
    const entity =
      args.workName?.trim() ||
      extractEntityFromQuery(query, lang === 'en' ? 'review' : 'anmeldelse') ||
      args.title;
    const natural = craftReviewTitle(entity, lang);
    if (natural && !findForbiddenPhrases(natural).length) {
      seoTitle = natural;
    }
  } else if (!isReview && query && isCmsSeoFieldEmpty(currentTitle)) {
    // Non-review empty title: entity-first, optionally incorporate short query if it matches entity
    const entity = (args.workName || args.title).trim();
    const qLower = query.toLowerCase();
    const entLower = entity.toLowerCase();
    if (qLower.includes(entLower) || entLower.includes(qLower.slice(0, Math.min(12, qLower.length)))) {
      seoTitle = truncate(entity, OPPORTUNITY_SEO_TITLE_MAX);
    }
  }

  // Evidence-aware meta: lead with entity/work + calm magazine tone (no generic clickbait).
  if (needsMeta) {
    metaDescription = craftEvidenceMeta({
      language: lang,
      isReview,
      workName: args.workName || args.title,
      query,
      fallback: metaDescription,
      bodyExcerpt: args.bodyExcerpt,
    });
  }

  seoTitle = scrubForbidden(seoTitle);
  metaDescription = scrubForbidden(metaDescription);

  if (needsTitle && seoTitle && seoTitle !== String(currentTitle || '').trim()) {
    proposals.push({
      field: 'seoTitle',
      currentValue: isCmsSeoFieldEmpty(currentTitle) ? null : String(currentTitle).trim(),
      proposedValue: seoTitle,
      rationale: isReview
        ? `Review-SEO dækker søgeintention (${lang === 'en' ? 'review' : 'anmeldelse'}) uden stuffing`
        : query
          ? `Evidensbaseret SEO-title for query-intention uden keyword stuffing`
          : 'Styrk SEO-title længde/klarhed ud fra SERP-signaler',
    });
  }

  if (needsMeta && metaDescription && metaDescription !== String(currentMeta || '').trim()) {
    proposals.push({
      field: 'metaDescription',
      currentValue: isCmsSeoFieldEmpty(currentMeta) ? null : String(currentMeta).trim(),
      proposedValue: metaDescription,
      rationale: 'Meta justeret for CTR med SEO Engine-regler (tone, banned phrases, længde)',
    });
  }

  return proposals.filter((p) => {
    if (findForbiddenPhrases(p.proposedValue).length) return false;
    if (p.field === 'seoTitle') {
      const review = checkReviewSeoTitle({
        seoTitle: p.proposedValue,
        language: lang,
        articleType: args.articleType,
      });
      if (review.applies && !review.ok) return false;
      if (
        p.proposedValue.length < 20 ||
        p.proposedValue.length > OPPORTUNITY_SEO_TITLE_MAX
      ) {
        return false;
      }
    }
    if (p.field === 'metaDescription') {
      if (
        p.proposedValue.length < OPPORTUNITY_META_MIN ||
        p.proposedValue.length > OPPORTUNITY_META_MAX
      ) {
        return false;
      }
    }
    return true;
  });
}

function craftReviewTitle(entity: string, language: 'da' | 'en'): string {
  const keyword = language === 'en' ? 'review' : 'anmeldelse';
  const clean = stripReviewWords(entity, language);
  const natural = `${clean} ${keyword}`.replace(/\s+/g, ' ').trim();
  if (natural.length <= OPPORTUNITY_SEO_TITLE_MAX) return natural;
  const budget = Math.max(8, OPPORTUNITY_SEO_TITLE_MAX - keyword.length - 1);
  return `${truncate(clean, budget)} ${keyword}`.trim();
}

function craftEvidenceMeta(args: {
  language: 'da' | 'en';
  isReview: boolean;
  workName: string;
  query: string;
  fallback: string;
  bodyExcerpt?: string | null;
}): string {
  const entity = (args.workName || '').trim();
  const excerpt = (args.bodyExcerpt || '').replace(/\s+/g, ' ').trim();
  if (excerpt.length >= OPPORTUNITY_META_MIN && excerpt.length <= OPPORTUNITY_META_MAX) {
    if (!findForbiddenPhrases(excerpt).length) return excerpt;
  }

  const calm =
    args.language === 'en'
      ? args.isReview
        ? `${entity} review on Apropos Magazine — focused take on craft, tone and whether it holds up.`
        : `${entity} on Apropos Magazine — clear context and perspective for curious readers.`
      : args.isReview
        ? `${entity} anmeldelse hos Apropos Magazine — fokus vurdering af håndværk, tone og om det holder.`
        : `${entity} hos Apropos Magazine — klar kontekst og perspektiv til nysgerrige læsere.`;

  let out = truncate(calm, OPPORTUNITY_META_MAX);
  if (out.length < OPPORTUNITY_META_MIN) {
    out = truncate(`${out} ${args.fallback}`.trim(), OPPORTUNITY_META_MAX);
  }
  if (out.length < OPPORTUNITY_META_MIN) {
    out = truncate(args.fallback, OPPORTUNITY_META_MAX);
  }
  return out;
}

function scrubForbidden(text: string): string {
  let t = text;
  for (const p of findForbiddenPhrases(t)) {
    t = t.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').replace(/\s+/g, ' ').trim();
  }
  return t;
}

function extractEntityFromQuery(query: string, keyword: string): string {
  const q = query.trim();
  if (!q) return '';
  const re = new RegExp(`\\b${keyword}s?\\b`, 'i');
  return q.replace(re, '').replace(/\s+/g, ' ').trim();
}

function stripReviewWords(title: string, language: 'da' | 'en'): string {
  const t = title.trim();
  if (language === 'en') return t.replace(/\breviews?\b/gi, '').replace(/\s+/g, ' ').trim();
  return t.replace(/\banmeldelser?\b/gi, '').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const sliced = t.slice(0, max);
  const sp = sliced.lastIndexOf(' ');
  if (sp >= Math.floor(max * 0.55)) return sliced.slice(0, sp).trim();
  return sliced.trim();
}

/** Ensure review titles keep the required keyword after craft (tests / apply). */
export function proposalHasReviewIntent(
  seoTitle: string,
  language: 'da' | 'en' | undefined
): boolean {
  const check = checkReviewSeoTitle({
    seoTitle,
    language: language || 'da',
    articleType: language === 'en' ? 'Review' : 'Anmeldelse',
  });
  // For explicit review-type checks callers pass articleType; this helper is best-effort
  return /\b(anmeldelse|review)\b/i.test(seoTitle) || check.ok;
}
