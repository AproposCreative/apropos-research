import {
  appendInboundMessage,
  findThreadForInbound,
  updateMessageDelivery,
} from '@/lib/funding/email-thread-store';
import { summarizeInboundEmail } from '@/lib/funding/summarize-inbound';
import type { EmailDeliveryStatus } from '@/lib/funding/types';

function extractTags(data: Record<string, unknown>): Record<string, string> {
  const tags = data.tags;
  if (!tags || typeof tags !== 'object') return {};
  const out: Record<string, string> = {};
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (t && typeof t === 'object' && 'name' in t && 'value' in t) {
        out[String((t as { name: string }).name)] = String((t as { value: string }).value);
      }
    }
  } else {
    for (const [k, v] of Object.entries(tags as Record<string, unknown>)) {
      if (v != null) out[k] = String(v);
    }
  }
  return out;
}

function extractAddresses(field: unknown): string[] {
  if (Array.isArray(field)) return field.map(String);
  if (typeof field === 'string') return [field];
  return [];
}

function extractEmailBody(data: Record<string, unknown>): string {
  if (typeof data.text === 'string' && data.text.trim()) return data.text;
  if (typeof data.html === 'string') return data.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

export async function handleFundingResendEvent(
  type: string,
  data: Record<string, unknown>
): Promise<{ handled: boolean; detail?: string }> {
  const tags = extractTags(data);

  if (type === 'email.received') {
    const from = typeof data.from === 'string' ? data.from : '';
    const fromEmail = from.match(/<([^>]+)>/)?.[1] || from;
    const toList = extractAddresses(data.to);
    const subject = typeof data.subject === 'string' ? data.subject : '(uden emne)';
    const text = extractEmailBody(data);

    const threadId = tags.funding_thread_id;
    const { getThreadById } = await import('@/lib/funding/email-thread-store');
    let thread = threadId ? getThreadById(threadId) : undefined;
    if (!thread) {
      thread = findThreadForInbound({ toAddresses: toList, fromEmail });
    }

    if (!thread) return { handled: false };

    const { aiSummary, suggestedReply } = await summarizeInboundEmail({
      subject,
      from: fromEmail,
      text,
      thread,
    });

    appendInboundMessage(
      thread.id,
      {
        from: fromEmail,
        to: toList[0] || '',
        subject,
        text,
        html: typeof data.html === 'string' ? data.html : undefined,
        receivedAt: new Date().toISOString(),
      },
      { aiSummary, suggestedReply }
    );

    return { handled: true, detail: `inbound:${thread.id}` };
  }

  const threadId = tags.funding_thread_id;
  const emailId = typeof data.email_id === 'string' ? data.email_id : undefined;
  if (!threadId || !emailId) return { handled: false };

  const deliveryMap: Record<string, EmailDeliveryStatus> = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.bounced': 'bounced',
    'email.failed': 'failed',
    'email.sent': 'sent',
  };
  const status = deliveryMap[type];
  if (status) {
    updateMessageDelivery(emailId, status);
    return { handled: true, detail: `delivery:${status}` };
  }

  return { handled: false };
}

export function isFundingTaggedEvent(data: Record<string, unknown>): boolean {
  const tags = extractTags(data);
  return Boolean(tags.funding_thread_id);
}
