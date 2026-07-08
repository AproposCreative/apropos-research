import type { EditorialSource } from '@/lib/editorial/types';

export type FundingCategoryId =
  | 'dk-kultur'
  | 'dk-medie-journalistik'
  | 'eu-international'
  | 'private-fonde'
  | 'regional-kommunal';

export type FundingCategory = {
  id: FundingCategoryId;
  label: string;
  searchSeeds: string[];
  siteHints: string[];
};

export type DeadlineStatus = 'open' | 'closed' | 'unknown';

export type FundingOpportunity = {
  id: string;
  title: string;
  funder: string;
  category: string;
  categoryId: FundingCategoryId;
  amountHint?: string;
  currency?: string;
  deadline?: string;
  deadlineStatus: DeadlineStatus;
  eligibilitySummary: string;
  requirements: string[];
  fitScore: number;
  urgencyScore: number;
  riskScore: number;
  duplicateRisk?: number;
  sources: EditorialSource[];
  nextAction: string;
  discoveredAt?: string;
  updatedAt?: string;
};

export type ApplicationStatus =
  | 'discovered'
  | 'researching'
  | 'drafting'
  | 'submitted'
  | 'won'
  | 'lost'
  | 'skipped';

export type FundingApplication = {
  id: string;
  opportunityId: string;
  opportunityTitle?: string;
  funder?: string;
  status: ApplicationStatus;
  notes?: string;
  primaryContactEmail?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationSection = 'project' | 'impact' | 'budget' | 'full';

export type ApplicationSectionOption = {
  id: ApplicationSection;
  label: string;
  description: string;
};

export type FundingQualityGateCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type FundingQualityGate = {
  ready: boolean;
  score: number;
  sourceCount: number;
  sourceDiversity: number;
  checks: FundingQualityGateCheck[];
};

export type FundingDossier = {
  opportunity: FundingOpportunity;
  sources: EditorialSource[];
  keyFacts: string[];
  unansweredQuestions: string[];
  eligibilityMatch: string;
  eligibilityGaps: string[];
  narrativeAngle: string;
  requiredDocuments: string[];
};

export type ApplicationBrief = {
  opportunityId: string;
  opportunityTitle: string;
  applicationSection: ApplicationSection;
  text: string;
};

export type FundingResearchResult = {
  dossier: FundingDossier;
  qualityGate: FundingQualityGate;
  brief: ApplicationBrief;
};

export type DiscoverOpportunitiesOptions = {
  coveredIds?: string[];
  limit?: number;
  mergeStored?: boolean;
};

export type CoveredFundingEntry = {
  opportunityId?: string;
  title?: string;
  funder?: string;
};

export type EmailThreadStatus = 'draft' | 'sent' | 'awaiting_reply' | 'replied' | 'closed';

export type EmailDeliveryStatus = 'sent' | 'delivered' | 'bounced' | 'opened' | 'failed';

export type FundingEmailMessage = {
  id: string;
  direction: 'outbound' | 'inbound';
  resendEmailId?: string;
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  sentAt?: string;
  receivedAt?: string;
  deliveryStatus?: EmailDeliveryStatus;
  aiSummary?: string;
  suggestedReply?: string;
};

export type FundingEmailThread = {
  id: string;
  applicationId: string;
  opportunityId: string;
  contactEmail: string;
  contactName?: string;
  subject: string;
  status: EmailThreadStatus;
  lastOutboundResendId?: string;
  messages: FundingEmailMessage[];
  createdAt: string;
  updatedAt: string;
};
