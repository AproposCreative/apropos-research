/**
 * Safe metadata proposals only — never editorial title, body, stance, rating, slug, dates.
 * Review SEO titles use natural "[work] anmeldelse/review" without keyword stuffing.
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
  isReviewSeoArticleType,
  seoTitleHasReviewKeyword,
} from '@/lib/seo-engine/review-title-rule';

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

  if (needsTitle) {
    const proposedTitle = craftSeoTitle({
      editorialTitle: args.title,
      query,
      current: currentTitle,
      language: lang,
      articleType: args.articleType,
      workName: args.workName,
    });
    if (proposedTitle && proposedTitle !== String(currentTitle || '').trim()) {
      proposals.push({
        field: 'seoTitle',
        currentValue: isCmsSeoFieldEmpty(currentTitle) ? null : String(currentTitle).trim(),
        proposedValue: proposedTitle,
        rationale: isReview
          ? `Review-SEO dækker søgeintention (${lang === 'en' ? 'review' : 'anmeldelse'}) uden stuffing`
          : query
            ? `Evidensbaseret query "${query}" i SEO-title for bedre CTR`
            : 'Styrk SEO-title længde/klarhed ud fra SERP-signaler',
      });
    }
  }

  const needsMeta =
    args.signals.includes('weak_or_missing_meta') ||
    args.signals.includes('high_impressions_low_ctr') ||
    args.signals.includes('declining_article');

  if (needsMeta) {
    const proposedMeta = craftMetaDescription({
      editorialTitle: args.title,
      query,
      current: currentMeta,
      language: lang,
      workName: args.workName,
      isReview,
    });
    if (proposedMeta && proposedMeta !== String(currentMeta || '').trim()) {
      proposals.push({
        field: 'metaDescription',
        currentValue: isCmsSeoFieldEmpty(currentMeta) ? null : String(currentMeta).trim(),
        proposedValue: proposedMeta,
        rationale: 'Meta-description justeret for CTR uden at ændre redaktionel holdning',
      });
    }
  }

  return proposals;
}

function craftSeoTitle(args: {
  editorialTitle: string;
  query: string;
  current: string | null | undefined;
  language: 'da' | 'en';
  articleType?: string | null;
  workName?: string | null;
}): string {
  const lang = args.language;
  const work = (args.workName || '').trim();
  const isReview = isReviewSeoArticleType(args.articleType);

  if (isReview) {
    const keyword = lang === 'en' ? 'review' : 'anmeldelse';
    // Prefer work name; fall back to cleaned editorial title / query entity
    const entity =
      work ||
      extractEntityFromQuery(args.query, keyword) ||
      stripReviewWords(args.editorialTitle, lang) ||
      args.editorialTitle.trim();
    const natural = `${entity} ${keyword}`.replace(/\s+/g, ' ').trim();
    if (natural.length <= OPPORTUNITY_SEO_TITLE_MAX) return natural;
    const budget = Math.max(8, OPPORTUNITY_SEO_TITLE_MAX - keyword.length - 1);
    return `${truncate(entity, budget)} ${keyword}`.trim();
  }

  const base = (
    args.current && !isCmsSeoFieldEmpty(args.current)
      ? String(args.current)
      : args.editorialTitle
  ).trim();

  if (!args.query) return truncate(base, OPPORTUNITY_SEO_TITLE_MAX);
  const q = args.query.trim();
  if (base.toLowerCase().includes(q.toLowerCase())) {
    return truncate(base, OPPORTUNITY_SEO_TITLE_MAX);
  }
  // Prefer query when it is the primary opportunity — avoid stuffing both long title + query
  if (q.length >= 12 && q.length <= OPPORTUNITY_SEO_TITLE_MAX && base.length > 40) {
    return truncate(q, OPPORTUNITY_SEO_TITLE_MAX);
  }
  const combined = `${base} — ${q}`;
  if (combined.length <= OPPORTUNITY_SEO_TITLE_MAX) return combined;
  const budget = Math.max(12, OPPORTUNITY_SEO_TITLE_MAX - q.length - 3);
  return truncate(`${truncate(base, budget)} — ${q}`, OPPORTUNITY_SEO_TITLE_MAX);
}

function craftMetaDescription(args: {
  editorialTitle: string;
  query: string;
  current: string | null | undefined;
  language: 'da' | 'en';
  workName?: string | null;
  isReview?: boolean;
}): string {
  if (args.current && !isCmsSeoFieldEmpty(args.current)) {
    const cur = String(args.current).trim();
    if (cur.length >= 70 && cur.length <= 170) {
      if (!args.query || cur.toLowerCase().includes(args.query.toLowerCase())) return cur;
    }
  }
  const entity = (args.workName || args.editorialTitle || '').trim();
  const hook =
    args.language === 'en'
      ? args.isReview
        ? 'Read our honest review covering story, craft and replay value on Apropos Magazine.'
        : 'Read the full article with context and takeaways on Apropos Magazine.'
      : args.isReview
        ? 'Læs vores ærlige anmeldelse af gameplay, håndværk og oplevelse på Apropos Magazine.'
        : 'Læs den fulde artikel med kontekst og pointer på Apropos Magazine.';
  const intent =
    args.isReview && args.language === 'da'
      ? `${entity} anmeldelse. `
      : args.isReview && args.language === 'en'
        ? `${entity} review. `
        : args.query
          ? `${args.query}. `
          : entity
            ? `${entity}. `
            : '';
  let out = truncate(`${intent}${hook}`, OPPORTUNITY_META_MAX);
  // Guardrail: auto-apply requires meta within length bounds
  if (out.length < OPPORTUNITY_META_MIN) {
    const pad =
      args.language === 'en'
        ? ' Clear, evidence-based coverage for readers deciding what to play or watch next.'
        : ' Klar, evidensbaseret dækning til læsere der vælger næste spil, film eller serie.';
    out = truncate(`${out}${pad}`, OPPORTUNITY_META_MAX);
  }
  return out;
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
  return seoTitleHasReviewKeyword(seoTitle, language);
}
