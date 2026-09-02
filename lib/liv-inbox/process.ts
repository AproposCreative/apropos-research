import { getLivInboxSettings } from '@/lib/liv-inbox/settings-store';
import { createInboxItem } from '@/lib/liv-inbox/inbox-store';
import { decideInboxReply, type InboundEmailInput } from '@/lib/liv-inbox/assistant';
import { gatherSenderIntelligence, rememberInboxInteraction } from '@/lib/liv-inbox/context';
import type { LivInboxItem, LivInboxItemStatus, LivInboxSettings } from '@/lib/liv-inbox/types';

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

  return item;
}
