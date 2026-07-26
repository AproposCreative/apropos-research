/**
 * GSC/GA4-driven SEO opportunity engine — types.
 * Production default = automatic drift when connections are healthy (kill-switch opt-out).
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
  | 'dismissed'
  | 'skipped';

/** Only these CMS/domain fields may be auto-written. */
export type OpportunitySafeField = 'seoTitle' | 'metaDescription';

export type OpportunityEvidence = {
  query?: string | null;
  page?: string | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
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
  confidence?: number;
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
  /** 0–1 composite confidence for auto-apply gate. */
  confidence: number;
  signals: OpportunitySignalKind[];
  why: string;
  evidence: OpportunityEvidence;
  proposals: OpportunityProposal[];
  fingerprint: string;
  /** Stable key for write idempotency. */
  idempotencyKey: string;
  scanId: string;
  articleType?: string | null;
  workName?: string | null;
  language?: 'da' | 'en';
  /** Server-side JSON-LD HTML snapshot (safe schema update; not CMS body). */
  serverJsonLdHtml?: string | null;
  /** CMS lastUpdated at scan time — stale-write guard. */
  scannedCmsLastUpdated?: string | null;
  /** SEO fields as seen at scan time (stale-write compare). */
  scannedSeoTitle?: string | null;
  scannedMetaDescription?: string | null;
  createdAt?: string;
  updatedAt?: string;
  appliedAt?: string | null;
  appliedBy?: string | null;
  versionIds?: string[];
  skipReason?: string | null;
};

export type OpportunityScanStatus =
  | 'ok'
  | 'missing_gsc'
  | 'missing_ga4'
  | 'partial'
  | 'error'
  | 'auto_disabled'
  | 'connections_unhealthy';

export type OpportunityScanMode = 'collect' | 'optimize';

export type OpportunityScanReport = {
  schemaVersion: 2;
  kind: 'seo-opportunity-scan';
  scanId: string;
  createdAt: string;
  windowDays: number;
  mode: OpportunityScanMode;
  status: OpportunityScanStatus;
  statusMessage: string;
  gscConfigured: boolean;
  ga4Configured: boolean;
  autoEnabled: boolean;
  scannedPages: number;
  opportunityCount: number;
  appliedCount?: number;
  skippedCount?: number;
  opportunities: SeoOpportunity[];
};

export type OpportunityMetaVersion = {
  id: string;
  opportunityId: string;
  itemId: string;
  locale: 'da' | 'en';
  field: OpportunitySafeField | 'serverJsonLd';
  before: string | null;
  after: string;
  appliedAt: string;
  appliedBy: string;
  idempotencyKey?: string;
  rolledBackAt?: string | null;
  rolledBackBy?: string | null;
};

export type OpportunityAuditEntry = {
  id: string;
  at: string;
  actor: string;
  action:
    | 'scan'
    | 'collect'
    | 'optimize'
    | 'approve'
    | 'reject'
    | 'apply'
    | 'auto_apply'
    | 'rollback'
    | 'dismiss'
    | 'skip'
    | 'emergency_stop';
  opportunityId?: string;
  detail?: string;
};
