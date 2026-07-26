/**
 * GSC/GA4-driven SEO opportunity engine — types.
 * Recommendation/approval mode by default; auto only for safe metadata when enabled.
 */

export type OpportunitySignalKind =
  | 'high_impressions_low_ctr'
  | 'position_4_to_20'
  | 'rising_query'
  | 'declining_article'
  | 'query_cannibalization'
  | 'weak_or_missing_meta';

export type OpportunityStatus =
  | 'open'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'rolled_back'
  | 'dismissed';

export type OpportunitySafeField = 'seoTitle' | 'metaDescription';

export type OpportunityEvidence = {
  query?: string | null;
  page?: string | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
  /** Previous 28-day window for trend signals. */
  prevClicks?: number | null;
  prevImpressions?: number | null;
  prevCtr?: number | null;
  prevPosition?: number | null;
  ga4PageViews?: number | null;
  ga4EngagedSessions?: number | null;
  competingPages?: string[];
  currentSeoTitle?: string | null;
  currentMetaDescription?: string | null;
};

export type OpportunityProposal = {
  field: OpportunitySafeField;
  currentValue: string | null;
  proposedValue: string;
  rationale: string;
};

export type SeoOpportunity = {
  id: string;
  articleKey: string;
  itemId: string;
  locale: 'da' | 'en';
  slug: string;
  title: string;
  url: string | null;
  status: OpportunityStatus;
  score: number;
  signals: OpportunitySignalKind[];
  why: string;
  evidence: OpportunityEvidence;
  proposals: OpportunityProposal[];
  /** Scan fingerprint for idempotent upserts. */
  fingerprint: string;
  scanId: string;
  createdAt?: string;
  updatedAt?: string;
  appliedAt?: string | null;
  appliedBy?: string | null;
  /** Version history entry ids for rollback. */
  versionIds?: string[];
};

export type OpportunityScanStatus =
  | 'ok'
  | 'missing_gsc'
  | 'missing_ga4'
  | 'partial'
  | 'error';

export type OpportunityScanReport = {
  schemaVersion: 1;
  kind: 'seo-opportunity-scan';
  scanId: string;
  createdAt: string;
  windowDays: number;
  status: OpportunityScanStatus;
  statusMessage: string;
  gscConfigured: boolean;
  ga4Configured: boolean;
  scannedPages: number;
  opportunityCount: number;
  opportunities: SeoOpportunity[];
};

export type OpportunityMetaVersion = {
  id: string;
  opportunityId: string;
  itemId: string;
  locale: 'da' | 'en';
  field: OpportunitySafeField;
  before: string | null;
  after: string;
  appliedAt: string;
  appliedBy: string;
  rolledBackAt?: string | null;
  rolledBackBy?: string | null;
};

export type OpportunityAuditEntry = {
  id: string;
  at: string;
  actor: string;
  action:
    | 'scan'
    | 'approve'
    | 'reject'
    | 'apply'
    | 'auto_apply'
    | 'rollback'
    | 'dismiss';
  opportunityId?: string;
  detail?: string;
};
