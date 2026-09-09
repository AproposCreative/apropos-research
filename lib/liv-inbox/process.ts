import { getLivInboxSettings } from '@/lib/liv-inbox/settings-store';
import { createInboxItem, getInboxItem, listInboxItems, updateInboxItem } from '@/lib/liv-inbox/inbox-store';
import { decideInboxReply, type InboundEmailInput } from '@/lib/liv-inbox/assistant';
import { gatherSenderIntelligence, rememberInboxInteraction } from '@/lib/liv-inbox/context';
import { buildThreadContext, correlateInboundToLivItem } from '@/lib/liv-inbox/correlate';
import { sendEscalationToEditor } from '@/lib/liv-inbox/editor';
import { loadEditorialContext } from '@/lib/liv-inbox/editorial';
import { appendLivInboxAudit, type LivInboxAuditType } from '@/lib/liv-inbox/audit-store';
import { isLivInboxSendingEnabled, sendLivInboxReply } from '@/lib/liv-inbox/send';
import { isHistoricalLivInbound } from '@/lib/liv-inbox/inbound-age';
import { isAccessOrInvitationOffer, isLikelyPhishingInbound } from '@/lib/liv-inbox/inbound-guards';
import { newEntityId } from '@/lib/accreditation/ids';
import type { LivInboxItem, LivInboxItemStatus, LivInboxSettings } from '@/lib/liv-inbox/types';

const STATUS_AUDIT: Partial<Record<LivInboxItemStatus, LivInboxAuditType>> = {
  auto_replied: 'auto_prepared',
  draft: 'drafted',
  escalated: 'escalated',
};

/** Decide the final status from Liv's decision + the current settings. */
export function resolveInboxStatus(
  settings: LivInboxSettings,
  decision: { needsHuman: boolean; confidence: number }
): LivInboxItemStatus {
  if (decision.needsHuman || decision.confidence < settings.confidenceThreshold) {
    return 'escalated';
  }
  return settings.autoRespond ? 'auto_replied' : 'draft';
}

export interface ProcessInboundOptions {
  source?: 'manual' | 'imap';
  sourceMessageId?: string;
  sourceUid?: number;
  receivedAt?: string;
  /** Threading signals from the inbound MIME (used to correlate to a prior item). */
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
  /** Allow an actual auto-send for a confident reply (default true; the batch
   *  caller sets false once the per-run cap is reached). Sending still requires
   *  the LIV_INBOX_SENDING_ENABLED kill-switch. */
  allowAutoSend?: boolean;
}

/**
 * Core entry point: process one inbound email through Liv and persist the
 * result. Reusable from the UI (manual/simulated feed) and from the one.com
 * IMAP sync (real inbox) or a Resend inbound webhook.
 */
export async function processInboundEmail(
  input: InboundEmailInput,
  options: ProcessInboundOptions = {}
): Promise<LivInboxItem> {
  const settings = await getLivInboxSettings();
  const email = input.fromEmail.trim().toLowerCase();

  // Research the sender first (contact database + shared contacts sheet).
  const intel = await gatherSenderIntelligence(email, input.fromName);

  // Conversation threading: is this a reply to a prior item? If so, inherit its
  // thread and feed the earlier turns into the prompt so Liv builds on them.
  const allItems = await listInboxItems();
  const parent = correlateInboundToLivItem(
    { inReplyTo: options.inReplyTo, references: options.references, headers: options.headers },
    allItems
  );
  const threadId = parent?.threadId || newEntityId('thread');
  const threadItems = parent ? allItems.filter((i) => i.threadId === threadId) : [];
  const threadBlock = buildThreadContext(threadItems);

  // Editorial grounding: what we cover / what's planned (facts + workflow sheet).
  const editorialBlock = await loadEditorialContext();

  const combinedIntel = [intel.block, threadBlock, editorialBlock]
    .filter((b) => b && b.trim())
    .join('\n\n');

  const decision = await decideInboxReply(settings, input, combinedIntel);
  const status = resolveInboxStatus(settings, decision);

  const item = await createInboxItem({
    fromEmail: email,
    fromName: input.fromName?.trim() || undefined,
    subject: input.subject.trim(),
    body: input.body,
    receivedAt: options.receivedAt || new Date().toISOString(),
    category: decision.category,
    draftReply: decision.reply,
    originalDraftReply: decision.reply,
    confidence: decision.confidence,
    needsHuman: decision.needsHuman,
    reasoning: decision.reasoning,
    status,
    handledAt: status === 'auto_replied' ? new Date().toISOString() : undefined,
    language: decision.language,
    modelUsed: decision.modelUsed,
    promptVersion: decision.promptVersion,
    usedFallback: decision.usedFallback,
    source: options.source || 'manual',
    sourceMessageId: options.sourceMessageId,
    sourceUid: options.sourceUid,
    attachments: input.attachments && input.attachments.length ? input.attachments : undefined,
    threadId,
    parentItemId: parent?.id,
    contactKnown: intel.known,
    priorInteractions: intel.priorInteractions,
    contactNote: intel.note,
    relationshipStatus: intel.relationshipStatus,
  });

  // Learn who is who: record the inbound (and the reply if auto-sent).
  await rememberInboxInteraction({
    email,
    name: input.fromName,
    subject: input.subject.trim(),
    inboundBlurb: `Modtog (${decision.category}): "${input.subject.trim()}"`,
    replyBlurb: status === 'auto_replied' ? decision.reply : undefined,
  });

  // Audit trail (insight into what Liv did and why).
  await appendLivInboxAudit({
    type: STATUS_AUDIT[status] || 'drafted',
    itemId: item.id,
    contactEmail: email,
    subject: item.subject,
    detail: decision.reasoning,
    meta: {
      confidence: decision.confidence,
      category: decision.category,
      contactKnown: intel.known,
      source: options.source || 'manual',
      model: decision.modelUsed,
    },
  });

  // Optional break-in guard: auto-send only to established two-way contacts.
  const establishedOnly = /^(1|true|on|yes)$/i.test(
    (process.env.LIV_INBOX_AUTOSEND_ESTABLISHED_ONLY || '').trim()
  );
  const trustAllowsAutoSend = !establishedOnly || intel.relationshipStatus === 'established_two_way';
  const notHistorical = !isHistoricalLivInbound({ date: options.receivedAt });

  // Auto-send only for a confident reply, only when the kill-switch is on, and
  // only within the caller's per-run budget. Test-redirect keeps it safe.
  // Invitation/access offers: send the "tak, vi vender tilbage" holding reply,
  // then still escalate so Frederik decides coverage.
  const mayAutoSendHolding =
    isAccessOrInvitationOffer(input) &&
    status === 'escalated' &&
    settings.autoRespond &&
    Boolean(decision.reply.trim()) &&
    !isLikelyPhishingInbound(input);

  if (
    (status === 'auto_replied' || mayAutoSendHolding) &&
    options.allowAutoSend !== false &&
    trustAllowsAutoSend &&
    notHistorical &&
    isLivInboxSendingEnabled() &&
    settings.autoRespond &&
    decision.reply.trim()
  ) {
    const result = await sendLivInboxReply({
      itemId: item.id,
      to: email,
      subject: `Re: ${input.subject.trim()}`,
      text: decision.reply,
      inReplyToMessageId: options.sourceMessageId,
    });
    const sentItem = await updateInboxItem(item.id, {
      sent: result.sent,
      sentTo: result.to,
      sentAt: result.sent ? new Date().toISOString() : undefined,
      sendId: result.id,
      outboundMessageId: result.outboundMessageId,
      sendRedirected: result.redirected,
      sentVia: result.transport,
      sentCopyArchived: result.sentCopyArchived,
      sendBlockedReason: result.sent ? undefined : result.reason,
    });
    await appendLivInboxAudit({
      type: 'sent',
      itemId: item.id,
      contactEmail: email,
      subject: item.subject,
      detail: result.sent
        ? `Auto-sendt${result.redirected ? ` (test-redirect → ${result.to})` : ''}`
        : `Ikke sendt: ${result.reason}`,
      meta: { sent: result.sent, redirected: result.redirected, to: result.to },
    });
    if (status === 'auto_replied') return sentItem || item;
  }

  // In doubt → email the editor the question (dashboard-free human-in-the-loop),
  // when autonomous and sending is on. He replies; Liv then answers the sender.
  if (
    status === 'escalated' &&
    settings.autoRespond &&
    settings.askEditorOnDoubt !== false &&
    options.allowAutoSend !== false &&
    isLivInboxSendingEnabled()
  ) {
    const asked = await sendEscalationToEditor((await getInboxItem(item.id)) || item, settings);
    if (asked.sent) return (await getInboxItem(item.id)) || item;
  }

  return item;
}
