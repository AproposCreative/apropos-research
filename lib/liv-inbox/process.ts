import { getLivInboxSettings } from '@/lib/liv-inbox/settings-store';
import { createInboxItem } from '@/lib/liv-inbox/inbox-store';
import { decideInboxReply, type InboundEmailInput } from '@/lib/liv-inbox/assistant';
import { gatherSenderIntelligence, rememberInboxInteraction } from '@/lib/liv-inbox/context';
import { appendLivInboxAudit, type LivInboxAuditType } from '@/lib/liv-inbox/audit-store';
import { isLivInboxSendingEnabled, sendLivInboxReply } from '@/lib/liv-inbox/send';
import { updateInboxItem } from '@/lib/liv-inbox/inbox-store';
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

  const decision = await decideInboxReply(settings, input, intel.block);
  const status = resolveInboxStatus(settings, decision);

  const item = await createInboxItem({
    fromEmail: email,
    fromName: input.fromName?.trim() || undefined,
    subject: input.subject.trim(),
    body: input.body,
    receivedAt: options.receivedAt || new Date().toISOString(),
    category: decision.category,
    draftReply: decision.reply,
    confidence: decision.confidence,
    needsHuman: decision.needsHuman,
    reasoning: decision.reasoning,
    status,
    handledAt: status === 'auto_replied' ? new Date().toISOString() : undefined,
    modelUsed: decision.modelUsed,
    promptVersion: decision.promptVersion,
    usedFallback: decision.usedFallback,
    source: options.source || 'manual',
    sourceMessageId: options.sourceMessageId,
    sourceUid: options.sourceUid,
    contactKnown: intel.known,
    priorInteractions: intel.priorInteractions,
    contactNote: intel.note,
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

  // Auto-send only for a confident reply, only when the kill-switch is on, and
  // only within the caller's per-run budget. Test-redirect keeps it safe.
  if (
    status === 'auto_replied' &&
    options.allowAutoSend !== false &&
    isLivInboxSendingEnabled() &&
    decision.reply.trim()
  ) {
    const result = await sendLivInboxReply({
      itemId: item.id,
      to: email,
      subject: `Re: ${input.subject.trim()}`,
      text: decision.reply,
    });
    const sentItem = await updateInboxItem(item.id, {
      sent: result.sent,
      sentTo: result.to,
      sentAt: result.sent ? new Date().toISOString() : undefined,
      sendId: result.id,
      sendRedirected: result.redirected,
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
    return sentItem || item;
  }

  return item;
}
