import { appendAudit } from '@/lib/accreditation/audit-store';
import { isActiveAccreditationThread } from '@/lib/accreditation/imap/correlate';
import {
  appendInboundMessage,
  findThreadForInbound,
  getThreadById,
  updateMessageDelivery,
} from '@/lib/accreditation/email-thread-store';
import {
  classifyAndExtractIntake,
  isAddressedToLiv,
  isLivPlusAlias,
  isTrustedAccreditationRequester,
} from '@/lib/accreditation/inbound-intake';
import {
  autoReplyToExternal,
  processInternalIntake,
} from '@/lib/accreditation/orchestrator';
import { updateMemoryAfterEvent } from '@/lib/accreditation/memory-store';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';
import { summarizeAccreditationInbound } from '@/lib/accreditation/summarize-inbound';
import type { EmailDeliveryStatus } from '@/lib/accreditation/types';

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
  if (typeof data.html === 'string') {
    return data.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function parseFrom(from: string): { email: string; name?: string } {
  const email = from.match(/<([^>]+)>/)?.[1] || from;
  const name = from.match(/^([^<]+)</)?.[1]?.trim();
  return { email: email.trim(), name: name || undefined };
}

export async function handleAccreditationResendEvent(
  type: string,
  data: Record<string, unknown>
): Promise<{ handled: boolean; detail?: string }> {
  const tags = extractTags(data);

  if (type === 'email.received') {
    const fromRaw = typeof data.from === 'string' ? data.from : '';
    const { email: fromEmail, name: fromName } = parseFrom(fromRaw);
    const toList = extractAddresses(data.to);
    const subject = typeof data.subject === 'string' ? data.subject : '(uden emne)';
    const text = extractEmailBody(data);
    const resendEmailId = typeof data.email_id === 'string' ? data.email_id : undefined;

    const threadId = tags.accreditation_thread_id;
    let thread = threadId ? await getThreadById(threadId) : undefined;
    if (!thread) {
      thread = await findThreadForInbound({ toAddresses: toList, fromEmail });
    }
    if (thread && !isActiveAccreditationThread(thread)) {
      await appendAudit({
        requestId: thread.requestId,
        type: 'inbound_old_thread_ignored',
        detail: `Old or closed thread ignored from ${fromEmail}`,
        meta: { threadId: thread.id, subject: subject.slice(0, 200) },
      });
      thread = undefined;
    }

    if (thread) {
      const { aiSummary, suggestedReply, novelQuestion } = await summarizeAccreditationInbound({
        subject,
        from: fromEmail,
        text,
        thread,
      });

      await appendInboundMessage(
        thread.id,
        {
          from: fromEmail,
          to: toList[0] || '',
          subject,
          text,
          html: typeof data.html === 'string' ? data.html : undefined,
          receivedAt: new Date().toISOString(),
          resendEmailId,
          untrusted: true,
        },
        { aiSummary, suggestedReply, novelQuestion }
      );

      await updateMemoryAfterEvent({
        requestId: thread.requestId,
        threadId: thread.id,
        contactEmail: fromEmail,
        contactName: fromName,
        direction: 'inbound',
        blurb: (aiSummary || subject || 'inbound').slice(0, 200),
        subject,
      });

      const request = await getRequestById(thread.requestId);
      if (request) {
        await updateRequest(request.id, { status: 'replied' });
        await autoReplyToExternal({
          request,
          threadId: thread.id,
          to: fromEmail,
          subject: subject.startsWith('Re:') ? subject : `Re: ${thread.subject}`,
          suggestedReply,
          novelQuestion,
          inboundText: text,
          attachments: Array.isArray(data.attachments)
            ? (data.attachments as Array<Record<string, unknown>>)
                .map((a) => ({
                  filename: String(a.filename || a.name || 'attachment'),
                  contentType:
                    a.content_type || a.contentType
                      ? String(a.content_type || a.contentType)
                      : undefined,
                  contentBase64:
                    typeof a.content === 'string'
                      ? a.content
                      : typeof a.data === 'string'
                        ? a.data
                        : undefined,
                }))
                .filter((a) => a.contentBase64)
            : undefined,
        });
      }

      await appendAudit({
        requestId: thread.requestId,
        type: 'inbound',
        detail: `Svar modtaget fra ${fromEmail}`,
        meta: { threadId: thread.id, novelQuestion: Boolean(novelQuestion) },
      });
      return { handled: true, detail: `external_reply:${thread.id}` };
    }

    if (isAddressedToLiv(toList) && !isLivPlusAlias(toList)) {
      if (!(await isTrustedAccreditationRequester(fromEmail))) {
        await appendAudit({
          type: 'inbound_unmatched_external_ignored',
          detail: `Unmatched external mail ignored from ${fromEmail}`,
          meta: { subject: subject.slice(0, 200) },
        });
        return { handled: true, detail: 'external_unmatched_ignored' };
      }

      const classification = await classifyAndExtractIntake({
        subject,
        fromEmail,
        fromName,
        text,
      });

      if (!classification.isInternalAccreditationRequest) {
        await appendAudit({
          type: 'inbound_internal_non_accreditation_ignored',
          detail: `Internal non-accreditation mail ignored from ${fromEmail}`,
          meta: { reason: classification.reason },
        });
        return { handled: true, detail: 'internal_non_accreditation_ignored' };
      }

      const { requestIds } = await processInternalIntake({
        concerts: classification.concerts,
        fromEmail,
        fromName,
        subject,
        sourceEmailId: resendEmailId,
        forceEscalate: classification.ambiguous || classification.escalateFlags.length > 0,
        extraFlags: classification.escalateFlags,
      });

      await appendAudit({
        type: 'intake_batch',
        detail: `Oprettede ${requestIds.length} anmodning(er) fra ${fromEmail}`,
        meta: { count: requestIds.length },
      });

      return { handled: true, detail: `intake:${requestIds.join(',')}` };
    }

    return { handled: false };
  }

  const accThreadId = tags.accreditation_thread_id;
  const emailId = typeof data.email_id === 'string' ? data.email_id : undefined;
  if (!accThreadId || !emailId) return { handled: false };

  const deliveryMap: Record<string, EmailDeliveryStatus> = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.bounced': 'bounced',
    'email.failed': 'failed',
    'email.sent': 'sent',
  };
  const status = deliveryMap[type];
  if (status) {
    await updateMessageDelivery(emailId, status);
    return { handled: true, detail: `delivery:${status}` };
  }

  return { handled: false };
}

export function isAccreditationTaggedEvent(data: Record<string, unknown>): boolean {
  const tags = extractTags(data);
  if (tags.accreditation_thread_id || tags.accreditation_request_id) return true;
  const to = extractAddresses(data.to);
  return typeLooksLikeReceived(data) && isAddressedToLiv(to);
}

function typeLooksLikeReceived(data: Record<string, unknown>): boolean {
  // When called from webhook with type email.received we already branch;
  // for tagging, also match liv inbox addresses.
  return extractAddresses(data.to).length > 0;
}
