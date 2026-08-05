import { sanitizeLivOutput } from '@/lib/accreditation/sanitize';

/** Relationship with Apropos / Liv based on dialogue history. */
export type ContactRelationshipStatus =
  | 'unknown'
  | 'one_way'
  | 'established_two_way'
  | 'automated'
  | 'do_not_contact';

/** High-level contact category for outreach filtering. */
export type ContactCategory =
  | 'human'
  | 'role'
  | 'automated'
  | 'unknown';

/**
 * Structured contact profile — sanitized facts only.
 * Never store mailbox passwords or full private email bodies.
 */
export type ContactProfile = {
  /** Deterministic doc id = normalized email. */
  email: string;
  name?: string;
  companyHint?: string;
  /** Email domain or company domain hint. */
  domain?: string;
  roleHint?: string;
  relationshipStatus: ContactRelationshipStatus;
  category: ContactCategory;
  /** Which mailbox first saw this contact (liv@ / frederik@). */
  sourceMailbox?: string;
  interactionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastRequestId?: string;
  lastThreadId?: string;
  /** Recent safe subject lines only (no bodies). */
  recentSubjects: string[];
  notes?: string;
  /** Origin of last structured import (sheet archive, event, etc.). */
  importSource?: string;
  updatedAt: string;
};

/**
 * Compact conversation summary for a request — short, model-safe memory.
 * Never include raw full email bodies or secrets.
 */
export type ConversationSummary = {
  requestId: string;
  threadId?: string;
  summary: string;
  lastDirection?: 'inbound' | 'outbound';
  updatedAt: string;
};

export type MemorySyncMeta = {
  id: 'mailbox_archive';
  lastSyncAt: string;
  contactCount: number;
  imported: number;
  upserted: number;
  skipped: number;
  automatedCount: number;
  humanOrRoleCount: number;
};

export type UpsertContactProfileInput = {
  email: string;
  name?: string;
  companyHint?: string;
  domain?: string;
  roleHint?: string;
  relationshipStatus?: ContactRelationshipStatus;
  category?: ContactCategory;
  sourceMailbox?: string;
  lastRequestId?: string;
  lastThreadId?: string;
  recentSubject?: string;
  notes?: string;
  importSource?: string;
  /** When true, do not bump interactionCount (sheet import). */
  preserveInteractionCount?: boolean;
  firstSeenAt?: string;
  lastSeenAt?: string;
  interactionCount?: number;
};

export type MemoryBackendKind = 'firestore' | 'json' | 'memory';

export type MemoryHealth = {
  backend: MemoryBackendKind;
  ok: boolean;
  label: string;
  contactCount?: number;
  lastSyncAt?: string | null;
  error?: string;
};

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string | undefined {
  const parts = normalizeContactEmail(email).split('@');
  return parts.length === 2 && parts[1] ? parts[1] : undefined;
}

export function sanitizeSubjectLine(subject: string): string {
  return sanitizeLivOutput(subject.replace(/\s+/g, ' ').trim()).slice(0, 160);
}

export function isAutomatedSenderHeuristic(input: {
  email?: string;
  name?: string;
  category?: string;
  role?: string;
  rawText?: string;
}): boolean {
  const hay = [
    input.email,
    input.name,
    input.category,
    input.role,
    input.rawText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(automated|automatisk|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|bounce|notification|notifications|system|newsletter|nyhedsbrev|receipt|kvittering)\b/i.test(hay)) {
    return true;
  }
  if (input.email && /^(noreply|no-reply|donotreply|mailer-daemon|notifications?)[@.]/i.test(input.email)) {
    return true;
  }
  if (input.category && /auto|bot|system|machine/i.test(input.category)) {
    return true;
  }
  return false;
}

export function classifyCategory(input: {
  email?: string;
  name?: string;
  category?: string;
  role?: string;
  rawText?: string;
}): ContactCategory {
  if (isAutomatedSenderHeuristic(input)) return 'automated';
  const cat = (input.category || '').toLowerCase();
  if (/role|rolle|funktion|desk|presse|pr\b/.test(cat)) return 'role';
  if (/human|person|skribent|journalist|editor|redakt/.test(cat)) return 'human';
  if (input.name && !/^(info|presse|press|booking|tickets?)[@\s]/i.test(input.name)) {
    return 'human';
  }
  if (input.role || /presse|pr|booking|akkredit/i.test(input.name || '')) return 'role';
  return 'unknown';
}

export function mergeRecentSubjects(
  prev: string[] | undefined,
  next?: string,
  max = 8
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [next, ...(prev || [])]) {
    if (!s) continue;
    const clean = sanitizeSubjectLine(s);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}
