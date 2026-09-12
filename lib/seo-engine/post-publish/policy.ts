import { createHash } from 'node:crypto';

export type Metadata = { seoTitle: string; metaDescription: string };
export type MetadataField = keyof Metadata;
export type PublishedArticle = {
  itemId: string;
  locale: 'da' | 'en';
  /** Read from the live API, never inferred from lastPublished alone. */
  published: boolean;
  /** A staged editorial change must not be published by the SEO worker. */
  hasUnpublishedChanges: boolean;
  contentVersion: string;
  metadata: Metadata;
};
export type FieldAssessment = {
  field: MetadataField;
  verdict: 'keep' | 'improve' | 'needs_editor';
  reason: string;
  proposedValue?: string;
  /** Independent candidate review against the article, not the generator's score. */
  verifiedAgainstArticle: boolean;
};
export type PerformanceEvidence = {
  currentImpressions: number;
  previousImpressions: number;
  currentDays: number;
  previousDays: number;
  comparable: boolean;
  fetchedAt: string;
};
export type PolicyDecision = {
  action: 'keep' | 'apply' | 'defer' | 'needs_editor';
  reason: string;
  patch: Partial<Metadata>;
};

/** Limits are operational safeguards, not Google's display guarantees. */
export const POST_PUBLISH_POLICY = {
  version: 'post-publish-v1',
  cooldownMs: 28 * 24 * 60 * 60 * 1000,
  evidenceMaxAgeMs: 3 * 24 * 60 * 60 * 1000,
  minimumWindowDays: 14,
  minimumImpressions: 200,
} as const;

export function reviewKey(article: PublishedArticle): string {
  return createHash('sha256').update(JSON.stringify([
    POST_PUBLISH_POLICY.version, article.itemId, article.locale,
    article.contentVersion, article.metadata.seoTitle, article.metadata.metaDescription,
  ])).digest('hex');
}

/** A pure final gate shared by immediate review and later performance review. */
export function decideMetadataUpdate(args: {
  analyzed: PublishedArticle;
  fresh: PublishedArticle;
  assessments: FieldAssessment[];
  lockedFields: MetadataField[];
  mode: 'publication_quality' | 'performance';
  nowMs: number;
  lastAppliedAt?: string;
  evidence?: PerformanceEvidence;
}): PolicyDecision {
  const stop = (action: PolicyDecision['action'], reason: string): PolicyDecision => ({ action, reason, patch: {} });
  if (!args.analyzed.published || !args.fresh.published) return stop('defer', 'not_published');
  if (args.analyzed.hasUnpublishedChanges || args.fresh.hasUnpublishedChanges) return stop('defer', 'editorial_draft');
  if (reviewKey(args.analyzed) !== reviewKey(args.fresh)) return stop('defer', 'article_changed');
  if (!Number.isFinite(args.nowMs)) return stop('defer', 'invalid_clock');
  if (args.lastAppliedAt) {
    const last = Date.parse(args.lastAppliedAt);
    if (!Number.isFinite(last) || args.nowMs - last < POST_PUBLISH_POLICY.cooldownMs) {
      return stop('defer', 'cooldown');
    }
  }
  if (args.mode === 'performance') {
    const e = args.evidence;
    const age = e ? args.nowMs - Date.parse(e.fetchedAt) : NaN;
    if (!e || !e.comparable || !Number.isFinite(age) || age < 0 || age > POST_PUBLISH_POLICY.evidenceMaxAgeMs ||
      ![e.currentImpressions, e.previousImpressions, e.currentDays, e.previousDays].every(Number.isFinite) ||
      e.currentImpressions < POST_PUBLISH_POLICY.minimumImpressions ||
      e.previousImpressions < POST_PUBLISH_POLICY.minimumImpressions ||
      e.currentDays !== e.previousDays || e.currentDays < POST_PUBLISH_POLICY.minimumWindowDays) {
      return stop('defer', 'insufficient_performance_evidence');
    }
  }
  const patch: Partial<Metadata> = {};
  const seen = new Set<MetadataField>();
  for (const assessment of args.assessments) {
    if (!['seoTitle', 'metaDescription'].includes(assessment.field) || seen.has(assessment.field)) {
      return stop('needs_editor', 'invalid_assessment');
    }
    seen.add(assessment.field);
    if (args.lockedFields.includes(assessment.field)) continue;
    if (assessment.verdict === 'needs_editor') return stop('needs_editor', 'editorial_uncertainty');
    if (assessment.verdict === 'keep') continue;
    if (assessment.verdict !== 'improve' || !assessment.verifiedAgainstArticle || !assessment.reason.trim()) {
      return stop('needs_editor', 'unverified_proposal');
    }
    const value = assessment.proposedValue?.trim();
    const max = assessment.field === 'seoTitle' ? 100 : 320;
    if (!value || value.length > max || /[<>\u0000-\u001f]/.test(value)) {
      return stop('needs_editor', 'invalid_metadata');
    }
    if (value !== args.fresh.metadata[assessment.field]) patch[assessment.field] = value;
  }
  if (seen.size !== 2) return stop('needs_editor', 'incomplete_assessment');
  return Object.keys(patch).length ? { action: 'apply', reason: 'verified_improvement', patch }
    : stop('keep', 'no_unlocked_improvement');
}
