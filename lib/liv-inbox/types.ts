/**
 * Liv Indbakke (Liv Inbox) — a general-purpose inbox assistant for Liv.
 *
 * Liv reads incoming email, decides how to respond based on the team's
 * guidelines ("how we normally handle inquiries"), drafts a warm, proactive
 * reply, and only escalates to a human when she is genuinely in doubt.
 *
 * This module is intentionally decoupled from the accreditation desk: it has
 * its own auto-respond toggle and its own guidelines/context, so turning Liv
 * on here does not affect the accreditation automation.
 */

export interface LivInboxSettings {
  /** Master auto-respond switch for the inbox assistant (own state). */
  autoRespond: boolean;
  /** Free-form house rules: how the team normally handles inquiries. */
  guidelines: string;
  /** Signature appended to Liv's outgoing replies. */
  signature: string;
  /**
   * Below this confidence (0-100) Liv escalates instead of answering,
   * even when auto-respond is ON.
   */
  confidenceThreshold: number;
  /**
   * Machine-learned style/decision notes distilled from the editor's (Frederik's)
   * corrections of Liv's drafts. Appended over time; injected into her prompt.
   */
  editorNotes?: string;
  updatedAt: string;
  updatedBy?: string;
}

export type LivInboxItemStatus =
  | 'auto_replied' // Liv was confident and auto-respond was ON
  | 'draft' // reply drafted, but auto-respond OFF → awaiting manual send
  | 'escalated' // Liv is in doubt → needs a human
  | 'sent' // human approved and sent
  | 'dismissed'; // human dismissed the item

export interface LivInboxItem {
  id: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  /** Trusted portion of the inbound email body. */
  body: string;
  receivedAt: string;

  /** Liv's classification of the inquiry (e.g. "presse", "generel", "faktura"). */
  category?: string;
  /** Liv's proposed reply (may be edited by a human before send). */
  draftReply?: string;
  /** Liv's pristine original draft, never mutated — used to learn from edits. */
  originalDraftReply?: string;
  /** Liv's self-assessed confidence (0-100). */
  confidence?: number;
  /** True when Liv decided she needs a human. */
  needsHuman?: boolean;
  /** Short human-readable explanation of Liv's decision. */
  reasoning?: string;

  status: LivInboxItemStatus;
  handledAt?: string;
  modelUsed?: string;
  promptVersion?: string;
  /** True when the decision came from the deterministic fallback (no LLM). */
  usedFallback?: boolean;

  /** Source metadata when ingested from Liv's real inbox (one.com IMAP). */
  source?: 'manual' | 'imap';
  /** RFC Message-ID used to de-duplicate IMAP ingestion. */
  sourceMessageId?: string;
  /** IMAP UID of the source message. */
  sourceUid?: number;

  /** True when Liv already knew this sender from the contact database. */
  contactKnown?: boolean;
  /** Number of prior logged interactions with this sender. */
  priorInteractions?: number;
  /** Short research note for the UI, e.g. "Kendt kontakt · 3 tidligere". */
  contactNote?: string;

  /** Outbound delivery state (only set once a real send is attempted). */
  sent?: boolean;
  /** Actual recipient after test-redirect (may be the safe sink). */
  sentTo?: string;
  sentAt?: string;
  sendId?: string;
  sendRedirected?: boolean;
  /** Transport used for the send: Liv's one.com SMTP or Resend. */
  sentVia?: 'smtp' | 'resend';
  /** True when the reply was archived to Liv's Sent folder (SMTP only). */
  sentCopyArchived?: boolean;
  /** Why a send was blocked (kill-switch off, allowlist, etc.). */
  sendBlockedReason?: string;
}

export interface LivInboxDecision {
  category: string;
  confidence: number;
  needsHuman: boolean;
  reasoning: string;
  reply: string;
  modelUsed: string;
  promptVersion: string;
  usedFallback: boolean;
}
