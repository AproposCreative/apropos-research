/**
 * Pure guardrails for automatic metadata writes.
 */

import { createHash } from 'node:crypto';
import {
  OPPORTUNITY_COOLDOWN_DAYS,
  OPPORTUNITY_EVIDENCE_IMPRESSIONS_MIN,
  OPPORTUNITY_FORBIDDEN_CMS_FIELDS,
  OPPORTUNITY_MAX_APPLY_PER_RUN,
  OPPORTUNITY_META_MAX,
  OPPORTUNITY_META_MIN,
  OPPORTUNITY_MIN_AUTO_CONFIDENCE,
  OPPORTUNITY_MIN_AUTO_SCORE,
  OPPORTUNITY_MIN_IMPRESSIONS_TO_OVERWRITE_STRONG,
  OPPORTUNITY_SEO_TITLE_MAX,
  OPPORTUNITY_SEO_TITLE_MIN,
} from '@/lib/seo-engine/opportunity-engine/constants';
import type {
  OpportunityProposal,
  SeoOpportunity,
} from '@/lib/seo-engine/opportunity-engine/types';
import { isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
import {
  checkReviewSeoTitle,
  isReviewSeoArticleType,
} from '@/lib/seo-engine/review-title-rule';
import { findForbiddenPhrases } from '@/lib/seo-engine/forbidden-phrases';

export type GuardrailSkipReason =
  | 'kill_switch_off'
  | 'connections_unhealthy'
  | 'low_score'
  | 'low_confidence'
  | 'insufficient_evidence'
  | 'cooldown_active'
  | 'batch_limit'
  | 'no_safe_proposals'
  | 'validation_failed'
  | 'strong_field_without_opportunity'
  | 'idempotency_duplicate'
  | 'unsafe_field'
  | 'stale_write'
  | 'editor_changed_field';

export type GuardrailDecision = {
  allow: boolean;
  reason?: GuardrailSkipReason;
  detail?: string;
};

export function isWithinCooldown(args: {
  lastAppliedAt: string | null | undefined;
  now?: Date;
  cooldownDays?: number;
}): boolean {
  if (!args.lastAppliedAt) return false;
  const t = Date.parse(args.lastAppliedAt);
  if (!Number.isFinite(t)) return false;
  const days = args.cooldownDays ?? OPPORTUNITY_COOLDOWN_DAYS;
  const now = args.now?.getTime() ?? Date.now();
  return now - t < days * 86_400_000;
}

export function computeOpportunityConfidence(args: {
  score: number;
  signals: string[];
  evidence: {
    impressions?: number | null;
    clicks?: number | null;
    ctr?: number | null;
    position?: number | null;
    query?: string | null;
    ga4EngagedSessions?: number | null;
  };
}): number {
  let c = 0.35;
  if ((args.evidence.impressions || 0) >= OPPORTUNITY_EVIDENCE_IMPRESSIONS_MIN) c += 0.15;
  if ((args.evidence.impressions || 0) >= OPPORTUNITY_MIN_IMPRESSIONS_TO_OVERWRITE_STRONG) c += 0.1;
  if (args.evidence.query && args.evidence.query.trim().length >= 3) c += 0.1;
  if (
    args.evidence.position != null &&
    args.evidence.position >= 4 &&
    args.evidence.position <= 20
  ) {
    c += 0.08;
  }
  if ((args.evidence.ga4EngagedSessions || 0) > 0) c += 0.05;
  if (args.signals.includes('high_impressions_low_ctr')) c += 0.08;
  if (args.signals.includes('weak_or_missing_meta')) c += 0.06;
  if (args.score >= 60) c += 0.05;
  if (args.score >= 80) c += 0.05;
  // Cannibalization alone is weaker for auto-write
  if (args.signals.length === 1 && args.signals[0] === 'query_cannibalization') c -= 0.15;
  return Math.max(0, Math.min(1, Math.round(c * 100) / 100));
}

export function validateProposalOutput(args: {
  proposal: OpportunityProposal;
  language?: 'da' | 'en';
  articleType?: string | null;
  workName?: string | null;
}): { ok: boolean; message?: string } {
  const v = (args.proposal.proposedValue || '').trim();
  if (!v) return { ok: false, message: 'empty_value' };

  const forbidden = findForbiddenPhrases(v);
  if (forbidden.length) {
    return { ok: false, message: `forbidden_phrase:${forbidden[0]}` };
  }

  if (args.proposal.field === 'seoTitle') {
    if (v.length < OPPORTUNITY_SEO_TITLE_MIN || v.length > OPPORTUNITY_SEO_TITLE_MAX) {
      return { ok: false, message: `seoTitle length ${v.length}` };
    }
    // Keyword stuffing heuristic: same token repeated 3+
    if (/\b(\w{4,})\b(?:\s+\1\b){2,}/i.test(v)) {
      return { ok: false, message: 'keyword_stuffing' };
    }
    // Naive query-append detection: "title — full query" with query repeating entity
    if (/\s[—-]\s/.test(v) && (v.match(/\b(\w{4,})\b/gi) || []).length > 8) {
      const tokens = v.toLowerCase().match(/[a-zæøå]{4,}/g) || [];
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
      for (const n of counts.values()) {
        if (n >= 3) return { ok: false, message: 'keyword_stuffing' };
      }
    }
    if (isReviewSeoArticleType(args.articleType)) {
      const review = checkReviewSeoTitle({
        seoTitle: v,
        language: args.language || 'da',
        articleType: args.articleType,
      });
      if (review.applies && !review.ok) {
        return { ok: false, message: 'review_keyword_missing' };
      }
    }
  }

  if (args.proposal.field === 'metaDescription') {
    if (v.length < OPPORTUNITY_META_MIN || v.length > OPPORTUNITY_META_MAX) {
      return { ok: false, message: `meta length ${v.length}` };
    }
  }

  return { ok: true };
}

/**
 * Stale-write guard: if live SEO/meta differs from the scanned snapshot, editor changed it.
 */
export function detectStaleSeoWrite(args: {
  scannedSeoTitle: string | null | undefined;
  scannedMetaDescription: string | null | undefined;
  liveSeoTitle: string | null | undefined;
  liveMetaDescription: string | null | undefined;
  scannedCmsLastUpdated?: string | null;
  liveCmsLastUpdated?: string | null;
}): { stale: boolean; reason?: GuardrailSkipReason; detail?: string } {
  const norm = (v: string | null | undefined) =>
    isCmsSeoFieldEmpty(v) ? '' : String(v).trim();

  if (
    args.scannedCmsLastUpdated &&
    args.liveCmsLastUpdated &&
    args.scannedCmsLastUpdated !== args.liveCmsLastUpdated
  ) {
    return { stale: true, reason: 'stale_write', detail: 'cmsLastUpdated' };
  }

  if (norm(args.scannedSeoTitle) !== norm(args.liveSeoTitle)) {
    return { stale: true, reason: 'editor_changed_field', detail: 'seoTitle' };
  }
  if (norm(args.scannedMetaDescription) !== norm(args.liveMetaDescription)) {
    return { stale: true, reason: 'editor_changed_field', detail: 'metaDescription' };
  }
  return { stale: false };
}

/** Reject CMS patches that touch editorial / forbidden fields. */
export function assertCmsPatchIsSafe(fieldData: Record<string, unknown>): void {
  for (const key of Object.keys(fieldData)) {
    const normalized = key.toLowerCase();
    if (
      (OPPORTUNITY_FORBIDDEN_CMS_FIELDS as readonly string[]).includes(normalized) ||
      (OPPORTUNITY_FORBIDDEN_CMS_FIELDS as readonly string[]).includes(key)
    ) {
      throw Object.assign(new Error(`Forbidden CMS field in patch: ${key}`), {
        code: 'unsafe_field',
      });
    }
    // Only allow known SEO slugs
    if (key !== 'seo-title' && key !== 'meta-description') {
      throw Object.assign(new Error(`Non-SEO CMS field in patch: ${key}`), {
        code: 'unsafe_field',
      });
    }
  }
}

export function isStrongSeoField(value: string | null | undefined, field: 'seoTitle' | 'metaDescription'): boolean {
  if (isCmsSeoFieldEmpty(value)) return false;
  const v = String(value).trim();
  if (field === 'seoTitle') {
    return v.length >= OPPORTUNITY_SEO_TITLE_MIN && v.length <= 70;
  }
  return v.length >= OPPORTUNITY_META_MIN && v.length <= 170;
}

/**
 * Decide whether an opportunity may be auto-applied.
 */
export function evaluateAutoApplyGuardrails(args: {
  opportunity: SeoOpportunity;
  lastAppliedAtForUrl?: string | null;
  appliedCountInRun: number;
  now?: Date;
  minScore?: number;
  minConfidence?: number;
}): GuardrailDecision {
  const opp = args.opportunity;
  const minScore = args.minScore ?? OPPORTUNITY_MIN_AUTO_SCORE;
  const minConfidence = args.minConfidence ?? OPPORTUNITY_MIN_AUTO_CONFIDENCE;

  if (args.appliedCountInRun >= OPPORTUNITY_MAX_APPLY_PER_RUN) {
    return { allow: false, reason: 'batch_limit', detail: `max ${OPPORTUNITY_MAX_APPLY_PER_RUN}` };
  }

  if (
    isWithinCooldown({
      lastAppliedAt: args.lastAppliedAtForUrl || opp.appliedAt,
      now: args.now,
    })
  ) {
    return { allow: false, reason: 'cooldown_active', detail: `${OPPORTUNITY_COOLDOWN_DAYS}d` };
  }

  if (opp.score < minScore) {
    return { allow: false, reason: 'low_score', detail: String(opp.score) };
  }

  const confidence =
    opp.confidence ??
    computeOpportunityConfidence({
      score: opp.score,
      signals: opp.signals,
      evidence: opp.evidence,
    });
  if (confidence < minConfidence) {
    return { allow: false, reason: 'low_confidence', detail: String(confidence) };
  }

  const impressions = opp.evidence.impressions ?? 0;
  if (impressions < OPPORTUNITY_EVIDENCE_IMPRESSIONS_MIN && !opp.signals.includes('weak_or_missing_meta')) {
    return { allow: false, reason: 'insufficient_evidence', detail: 'impressions' };
  }

  if (!opp.proposals.length) {
    return { allow: false, reason: 'no_safe_proposals' };
  }

  // Strong existing fields require documented high-evidence opportunity
  for (const p of opp.proposals) {
    if (isStrongSeoField(p.currentValue, p.field)) {
      const strongOk =
        impressions >= OPPORTUNITY_MIN_IMPRESSIONS_TO_OVERWRITE_STRONG &&
        (opp.signals.includes('high_impressions_low_ctr') ||
          opp.signals.includes('position_4_to_20') ||
          opp.signals.includes('declining_article'));
      if (!strongOk) {
        return {
          allow: false,
          reason: 'strong_field_without_opportunity',
          detail: p.field,
        };
      }
    }
    const validated = validateProposalOutput({
      proposal: p,
      language: opp.locale === 'en' ? 'en' : 'da',
      articleType: opp.articleType,
      workName: opp.workName,
    });
    if (!validated.ok) {
      return { allow: false, reason: 'validation_failed', detail: validated.message };
    }
  }

  return { allow: true };
}

export function buildIdempotencyKey(args: {
  itemId: string;
  url: string | null | undefined;
  fingerprint: string;
  proposedTitle?: string;
  proposedMeta?: string;
}): string {
  const raw = [
    args.itemId,
    (args.url || '').toLowerCase(),
    args.fingerprint,
    args.proposedTitle || '',
    args.proposedMeta || '',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 40);
}

export { OPPORTUNITY_MAX_APPLY_PER_RUN, OPPORTUNITY_COOLDOWN_DAYS };
