/**
 * Conversation threading for Liv Indbakke.
 *
 * Detects that an inbound mail is a REPLY to a prior Liv Indbakke item (via
 * In-Reply-To / References matching a stored Message-ID, or the
 * X-Apropos-LivInbox-Item header) so a back-and-forth stays one conversation
 * and Liv sees the full history instead of re-introducing herself.
 */
import type { LivInboxItem } from '@/lib/liv-inbox/types';

export interface InboundThreadingSignals {
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
}

/** Normalize an RFC Message-ID for comparison (strip <>, trim, lowercase). */
export function normalizeMsgId(id?: string): string {
  return (id || '').trim().replace(/^</, '').replace(/>$/, '').toLowerCase();
}

/**
 * Find a prior liv-inbox item that this inbound mail is a reply to.
 * Priority: explicit item header, then In-Reply-To/References matched against
 * Liv's outbound reply Message-ID or the original inbound Message-ID.
 */
export function correlateInboundToLivItem(
  signals: InboundThreadingSignals,
  items: LivInboxItem[]
): LivInboxItem | undefined {
  const headerItem = (signals.headers?.['x-apropos-livinbox-item'] || '').trim();
  if (headerItem) {
    const byHeader = items.find((i) => i.id === headerItem);
    if (byHeader) return byHeader;
  }

  const replyIds = [
    normalizeMsgId(signals.inReplyTo),
    ...(signals.references || []).map((r) => normalizeMsgId(r)),
  ].filter(Boolean);
  if (replyIds.length === 0) return undefined;

  // Newest-first so a reply attaches to the most recent matching turn.
  const sorted = [...items].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  for (const item of sorted) {
    const ids = [normalizeMsgId(item.outboundMessageId), normalizeMsgId(item.sourceMessageId)].filter(Boolean);
    if (ids.some((id) => replyIds.includes(id))) return item;
  }
  return undefined;
}

/** Compact prior-conversation block for Liv's prompt. */
export function buildThreadContext(threadItems: LivInboxItem[], maxItems = 6): string {
  const sorted = [...threadItems]
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    .slice(-maxItems);
  if (sorted.length === 0) return '';
  const turns = sorted.map((it) => {
    const inbound = `Modtaget: "${it.subject}" - ${(it.body || '').replace(/\s+/g, ' ').trim().slice(0, 180)}`;
    const reply = it.draftReply
      ? `Livs svar: ${it.draftReply.replace(/\s+/g, ' ').trim().slice(0, 180)}`
      : '';
    return [inbound, reply].filter(Boolean).join('\n');
  });
  return `TIDLIGERE I SAMTALEN (byg videre - gentag ikke hilsen/spørgsmål):\n${turns.join('\n---\n')}`;
}
