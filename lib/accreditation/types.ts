export type ContactConfidence = 'high' | 'medium' | 'low';

export type AccreditationRequestStatus =
  | 'intake'
  | 'researching'
  | 'needs_contact'
  | 'draft_ready'
  | 'awaiting_approval' // escalation queue only (risk gate)
  | 'sent_awaiting_reply'
  | 'replied'
  | 'reply_draft_ready'
  | 'granted'
  | 'denied'
  | 'withdrawn'
  | 'stalled'
  | 'notifying_applicants'
  | 'closed'
  | 'paused'
  | 'escalated';

export type AccreditationApplicant = {
  name: string;
  email?: string;
  notes?: string;
};

export type TicketAccessType = 'presse' | 'billetter' | 'staapladser' | 'siddepladser' | 'photo' | 'other';

/** Final ticket/access package lifecycle — separate from promoter “approval”. */
export type FinalDeliveryStatus =
  | 'none'
  | 'approval_only'
  | 'package_ready'
  | 'delivered'
  | 'failed';

export type AccessPackageAssetKind =
  | 'attachment'
  | 'link'
  | 'instruction'
  | 'qr_text'
  | 'confirmation';

export type AccessPackageAsset = {
  id: string;
  kind: AccessPackageAssetKind;
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
  /** Relative path under data/accreditation-attachments/ */
  storagePath?: string;
  url?: string;
  text?: string;
  sha256?: string;
  safe: boolean;
  quarantineReason?: string;
  createdAt: string;
};

export type AccessPackage = {
  requestId: string;
  assets: AccessPackageAsset[];
  guestListInstructions?: string;
  deliveryStatus: FinalDeliveryStatus;
  deliveredAt?: string;
  deliveredTo?: string;
  deliveredResendId?: string;
  updatedAt: string;
};

export type AccreditationRequest = {
  id: string;
  artist: string;
  venue?: string;
  eventDate?: string;
  applicants: AccreditationApplicant[];
  /** Primary recipient for final access package (UI or writer). */
  deliveryRecipientName?: string;
  deliveryRecipientEmail?: string;
  accessRequested?: string;
  ticketType?: TicketAccessType | string;
  /** Quantity of tickets / passes requested. */
  ticketQuantity?: number;
  promisedCoverage?: string;
  sourceIntakeEmailId?: string;
  sourceIntakeSubject?: string;
  /** Event page URL pasted in UI intake. */
  sourceEventUrl?: string;
  promoter?: string;
  contactName?: string;
  contactEmail?: string;
  contactConfidence?: ContactConfidence;
  senderMailbox: string;
  status: AccreditationRequestStatus;
  previousCoverageUrl?: string;
  sheetRowNumber?: number;
  threadId?: string;
  pendingApprovalId?: string;
  nextFollowUpAt?: string;
  followUpCount?: number;
  outcomeReason?: string;
  notes?: string;
  researchNotes?: string;
  paused?: boolean;
  /** True only after complete access package was forwarded to recipient. */
  finalPackageDelivered?: boolean;
  finalDeliveryStatus?: FinalDeliveryStatus;
  createdAt: string;
  updatedAt: string;
};

export type EmailThreadStatus = 'draft' | 'sent' | 'awaiting_reply' | 'replied' | 'closed';
export type EmailDeliveryStatus = 'sent' | 'delivered' | 'bounced' | 'opened' | 'failed';

export type AccreditationEmailMessage = {
  id: string;
  direction: 'outbound' | 'inbound';
  resendEmailId?: string;
  /** RFC Message-ID for IMAP reply correlation. */
  messageId?: string;
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
  novelQuestion?: boolean;
  /** External/quoted content treated as untrusted for policy. */
  untrusted?: boolean;
};

export type AccreditationEmailThread = {
  id: string;
  requestId: string;
  contactEmail: string;
  contactName?: string;
  subject: string;
  status: EmailThreadStatus;
  lastOutboundResendId?: string;
  messages: AccreditationEmailMessage[];
  createdAt: string;
  updatedAt: string;
};

export type ApprovalKind = 'first_outbound' | 'follow_up' | 'reply' | 'applicant_notice';

/** Risk flags that force escalation (human override). */
export type ApprovalPolicyFlag =
  | 'lowConfidence'
  | 'ambiguous'
  | 'novelQuestion'
  | 'affectsApplicant'
  | 'routineFollowUp'
  | 'credentialsOrCaptcha'
  | 'paymentOrLegal'
  | 'sensitivePersonalData'
  | 'unsafeToolAction'
  | 'promptInjectionSuspected';

export type ApprovalStatus = 'queued' | 'approved' | 'rejected' | 'sent' | 'superseded' | 'auto_sent';

export type ApprovalItem = {
  id: string;
  requestId: string;
  threadId?: string;
  kind: ApprovalKind;
  to: string;
  subject: string;
  text: string;
  html?: string;
  draftHash: string;
  policyFlags: ApprovalPolicyFlag[];
  status: ApprovalStatus;
  /** True when risk policy allows autonomous send. */
  autoEligible: boolean;
  rejectReason?: string;
  escalateReason?: string;
  approvedAt?: string;
  rejectedAt?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  requestId?: string;
  type: string;
  detail: string;
  meta?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type AgentControlState = {
  /** Global Liv automatic replies/sends. OFF = ingest + draft only. */
  automationEnabled: boolean;
  /** Legacy alias — true when automationEnabled is false. */
  paused: boolean;
  dryRun: boolean;
  pausedAt?: string;
  pauseReason?: string;
  lastToggledBy?: string;
  lastToggleSource?: string;
  updatedAt: string;
};

export type ExtractedConcertRequest = {
  artist: string;
  venue?: string;
  eventDate?: string;
  ticketType?: string;
  ticketQuantity?: number;
  accessRequested?: string;
  promisedCoverage?: string;
  writerName?: string;
  writerEmail?: string;
};

export type LivChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  requestIds?: string[];
};

export type LivChatThread = {
  id: string;
  title: string;
  messages: LivChatMessage[];
  linkedRequestIds: string[];
  updatedAt: string;
  createdAt: string;
};

export type IntakeClassification = {
  isInternalAccreditationRequest: boolean;
  confidence: number;
  reason: string;
  concerts: ExtractedConcertRequest[];
  ambiguous: boolean;
  escalateFlags: ApprovalPolicyFlag[];
};

/** Columns on the writable “Accreditation workflow” tab (exact headers). */
export const WORKFLOW_SHEET_HEADERS = [
  'Request ID',
  'Artist/event',
  'Venue',
  'Event date',
  'Applicant(s)',
  'Number',
  'Access requested',
  'Promoter/media',
  'Contact name',
  'Contact email',
  'Sender mailbox',
  'Status',
  'Last action',
  'Next follow-up',
  'Outcome/reason',
  'Email thread/source',
  'Notes',
] as const;

export type WorkflowSheetRow = {
  requestId: string;
  artist: string;
  venue: string;
  eventDate: string;
  applicants: string;
  number: string;
  accessRequested: string;
  promoter: string;
  contactName: string;
  contactEmail: string;
  senderMailbox: string;
  status: string;
  lastAction: string;
  nextFollowUp: string;
  outcomeReason: string;
  emailThreadSource: string;
  notes: string;
  rowNumber: number;
};

export type SheetContact = {
  name: string;
  company?: string;
  role?: string;
  email?: string;
  raw: Record<string, string>;
  /** Extra signals when sourced from mailbox archive / memory. */
  category?: 'human' | 'role' | 'automated' | 'unknown';
  relationshipStatus?: string;
  sourceMailbox?: string;
  messageCount?: number;
  establishedTwoWay?: boolean;
  isAutomated?: boolean;
};

/** Row from read-only "Mailbox contact archive" tab (deduplicated mailbox contacts). */
export type MailboxArchiveContact = {
  email?: string;
  name?: string;
  company?: string;
  domain?: string;
  role?: string;
  category?: string;
  relationship?: string;
  sourceMailbox?: string;
  messageCount?: number;
  hasReply?: boolean;
  firstSeenAt?: string;
  lastSeenAt?: string;
  recentSubject?: string;
  notes?: string;
  isAutomated?: boolean;
  raw: Record<string, string>;
  rowNumber: number;
};

export const DEFAULT_SENDER_MAILBOX = 'liv@aproposmagazine.com';
/** Production From via one.com SMTP — never news.aproposmagazine.com for Liv accreditation. */
export const DEFAULT_FROM_DISPLAY = 'Liv Brandt <liv@aproposmagazine.com>';
export const DEFAULT_SHEET_ID = '1R3PQqFOmiA940lIPZzzvlUIbgNyiO1h5XrzZUqMSoQI';
export const DEFAULT_WORKFLOW_TAB = 'Accreditation workflow';
export const DEFAULT_CONTACTS_TAB = 'Contacts etc.';
export const DEFAULT_MAILBOX_ARCHIVE_TAB = 'Mailbox contact archive';
export const LIV_MAILBOX = 'liv@aproposmagazine.com';
