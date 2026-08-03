/**
 * Safe metadata proposals — reuse SEO Engine rules (review intent, forbidden phrases,
 * article type, entity, language). Never editorial fields. No naive query-append stuffing.
 *
 * Low-quality / formulaic meta is skipped rather than written.
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

/** Detect generic / formulaic magazine filler we must not auto-write. */
const FORMULAIC_META =
  /hos Apropos Magazine|on Apropos Magazine|fra Apropos Magazine|fokus vurdering|focused take on craft|klar kontekst og perspektiv|clear context and perspective|guide og perspektiv|Læs artiklen nu|Read more on Apropos/i;

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

  const crafted = proposeArchiveSeoMetaHeuristic({
    title: args.workName?.trim() || args.title,
    bodyText: args.bodyExcerpt || undefined,
    language: lang,
    articleType: args.articleType,
    oldSeoTitle: isCmsSeoFieldEmpty(currentTitle) ? null : String(currentTitle),
    oldMetaDescription: isCmsSeoFieldEmpty(currentMeta) ? null : String(currentMeta),
  });

  let seoTitle = crafted.seoTitle;

  if (isReview && query) {
    // Never promote a raw GSC query to the work/entity name. Search queries are useful
    // evidence, but the editorial CMS title is the authoritative spelling and casing.
    const entity = args.workName?.trim() || args.title;
    const natural = craftReviewTitle(entity, lang);
    if (natural && !findForbiddenPhrases(natural).length) {
      seoTitle = natural;
    }
  } else if (!isReview && query && isCmsSeoFieldEmpty(currentTitle)) {
    const entity = (args.workName || args.title).trim();
    const qLower = query.toLowerCase();
    const entLower = entity.toLowerCase();
    if (qLower.includes(entLower) || entLower.includes(qLower.slice(0, Math.min(12, qLower.length)))) {
      seoTitle = truncate(entity, OPPORTUNITY_SEO_TITLE_MAX);
    }
  }

  seoTitle = scrubForbidden(seoTitle);

  if (needsTitle && seoTitle && seoTitle !== String(currentTitle || '').trim()) {
    const titleOk =
      !findForbiddenPhrases(seoTitle).length &&
      seoTitle.length >= 20 &&
      seoTitle.length <= OPPORTUNITY_SEO_TITLE_MAX &&
      (() => {
        const review = checkReviewSeoTitle({
          seoTitle,
          language: lang,
          articleType: args.articleType,
        });
        return !review.applies || review.ok;
      })();
    if (titleOk) {
      proposals.push({
        field: 'seoTitle',
        currentValue: isCmsSeoFieldEmpty(currentTitle) ? null : String(currentTitle).trim(),
        proposedValue: seoTitle,
        rationale: isReview
          ? `Review-SEO dækker søgeintention (${lang === 'en' ? 'review' : 'anmeldelse'}) uden stuffing`
          : query
            ? 'Evidensbaseret SEO-title for query-intention uden keyword stuffing'
            : 'Styrk SEO-title længde/klarhed ud fra SERP-signaler',
      });
    }
  }

  if (needsMeta) {
    const metaDescription = craftEvidenceMeta({
      language: lang,
      isReview,
      workName: args.workName || args.title,
      bodyExcerpt: args.bodyExcerpt,
      existingMeta: isCmsSeoFieldEmpty(currentMeta) ? null : String(currentMeta).trim(),
      heuristicMeta: crafted.metaDescription,
    });
    if (
      metaDescription &&
      metaDescription !== String(currentMeta || '').trim() &&
      !findForbiddenPhrases(metaDescription).length &&
      metaDescription.length >= OPPORTUNITY_META_MIN &&
      metaDescription.length <= OPPORTUNITY_META_MAX
    ) {
      proposals.push({
        field: 'metaDescription',
        currentValue: isCmsSeoFieldEmpty(currentMeta) ? null : String(currentMeta).trim(),
        proposedValue: metaDescription,
        rationale: 'Meta fra body-excerpt / eksisterende kvalitet — ingen generisk formulartekst',
      });
    }
    // If quality is too low, skip meta entirely (fail closed on weak copy).
  }

  return proposals;
}

function craftReviewTitle(entity: string, language: 'da' | 'en'): string {
  const keyword = language === 'en' ? 'review' : 'anmeldelse';
  const clean = stripReviewWords(entity, language);
  const natural = `${clean} ${keyword}`.replace(/\s+/g, ' ').trim();
  if (natural.length <= OPPORTUNITY_SEO_TITLE_MAX) return natural;
  const budget = Math.max(8, OPPORTUNITY_SEO_TITLE_MAX - keyword.length - 1);
  return `${truncate(clean, budget)} ${keyword}`.trim();
}

/**
 * Prefer a strong body excerpt. Never invent formulaic "hos Apropos Magazine — …" filler.
 * Returns null when quality is insufficient (caller skips the meta proposal).
 */
export function craftEvidenceMeta(args: {
  language: 'da' | 'en';
  isReview: boolean;
  workName: string;
  bodyExcerpt?: string | null;
  existingMeta?: string | null;
  heuristicMeta?: string | null;
}): string | null {
  const excerpt = (args.bodyExcerpt || '').replace(/\s+/g, ' ').trim();
  if (isStrongMetaCandidate(excerpt)) {
    return truncate(excerpt, OPPORTUNITY_META_MAX);
  }

  // Keep a strong existing meta unchanged (no rewrite) — caller compares equality.
  if (args.existingMeta && isStrongMetaCandidate(args.existingMeta)) {
    return args.existingMeta;
  }

  // Heuristic from archive agent may use body; accept only if not formulaic.
  const heuristic = (args.heuristicMeta || '').replace(/\s+/g, ' ').trim();
  if (isStrongMetaCandidate(heuristic)) {
    return truncate(heuristic, OPPORTUNITY_META_MAX);
  }

  // No natural Danish/English filler templates — skip when evidence is weak.
  return null;
}

export function isStrongMetaCandidate(text: string): boolean {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length < OPPORTUNITY_META_MIN || t.length > OPPORTUNITY_META_MAX + 20) return false;
  if (findForbiddenPhrases(t).length) return false;
  if (FORMULAIC_META.test(t)) return false;
  // Reject the previously shipped broken Danish fragment
  if (/fokus vurdering/i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;
  // Need some sentence-like substance (period, em-dash, or comma structure)
  if (!/[.!?,—,]/.test(t) && words.length < 14) return false;
  return true;
}

function scrubForbidden(text: string): string {
  let t = text;
  for (const p of findForbiddenPhrases(t)) {
    t = t
      .replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return t;
}

function stripReviewWords(title: string, language: 'da' | 'en'): string {
  const t = title.trim();
  const withoutKeyword =
    language === 'en'
      ? t.replace(/\breviews?\b/gi, '')
      : t.replace(/\banmeldelser?\b/gi, '');
  return withoutKeyword
    .replace(/^\s*[:|—–-]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const sliced = t.slice(0, max);
  const sp = sliced.lastIndexOf(' ');
  if (sp >= Math.floor(max * 0.55)) return sliced.slice(0, sp).trim();
  return sliced.trim();
}

export function proposalHasReviewIntent(
  seoTitle: string,
  _language: 'da' | 'en' | undefined
): boolean {
  return /\b(anmeldelse|review)\b/i.test(seoTitle);
}
