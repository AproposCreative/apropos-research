import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createSuccessResponse } from '@/lib/api/types';
import { getAgentControl } from '@/lib/accreditation/agent-control';
import { readAuditEvents } from '@/lib/accreditation/audit-store';
import { getThreadsByRequestId } from '@/lib/accreditation/email-thread-store';
import { readRequests } from '@/lib/accreditation/request-store';
import { STATUS_LABELS_DA } from '@/lib/accreditation/state-machine';
import type { AccreditationRequest } from '@/lib/accreditation/types';

export const runtime = 'nodejs';

function overviewStatus(req: AccreditationRequest): string {
  if (req.paused || req.status === 'paused') return 'paused';
  if (req.status === 'sent_awaiting_reply' && req.nextFollowUpAt) {
    if (Date.parse(req.nextFollowUpAt) <= Date.now()) return 'follow_up_due';
  }
  if (req.status === 'intake') return 'pending';
  return req.status;
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const control = await getAgentControl();
  const requests = await readRequests();

  const tickets = (
    await Promise.all(
      requests.map(async (r) => {
        const applicants = Array.isArray(r.applicants) ? r.applicants : [];
        const threads = await getThreadsByRequestId(r.id);
        const thread = threads[0];
        const lastMsg = thread?.messages?.length
          ? thread.messages[thread.messages.length - 1]
          : undefined;
        const ov = overviewStatus(r);
        return {
          id: r.id,
          artist: r.artist,
          venue: r.venue || null,
          eventDate: r.eventDate || null,
          applicants,
          applicantLabel: applicants.map((a) => a?.name).filter(Boolean).join(', ') || '-',
          ticketType: r.ticketType || r.accessRequested || null,
          ticketQuantity: r.ticketQuantity ?? applicants.length ?? null,
          accessRequested: r.accessRequested || null,
          contactName: r.contactName || null,
          contactEmail: r.contactEmail || null,
          promoter: r.promoter || null,
          status: r.status,
          overviewStatus: ov,
          statusLabel:
            ov === 'follow_up_due'
              ? 'Follow-up forfalden'
              : ov === 'pending'
                ? 'Pending'
                : STATUS_LABELS_DA[r.status] || r.status,
          paused: Boolean(r.paused),
          nextFollowUpAt: r.nextFollowUpAt || null,
          outcomeReason: r.outcomeReason || null,
          latestMessage: lastMsg
            ? {
                direction: lastMsg.direction,
                subject: lastMsg.subject,
                preview: (lastMsg.text || '').slice(0, 160),
                at: lastMsg.sentAt || lastMsg.receivedAt || null,
              }
            : null,
          nextAction:
            ov === 'follow_up_due'
              ? 'Send follow-up'
              : ov === 'granted'
                ? 'Adgang bekræftet'
                : ov === 'escalated'
                  ? 'Kræver review'
                  : ov === 'draft_ready'
                    ? 'Udkast klar'
                    : ov === 'sent_awaiting_reply'
                      ? 'Afventer svar'
                      : ov === 'researching'
                        ? 'Research i gang'
                        : 'Se detaljer',
          finalAccess:
            r.finalPackageDelivered || r.finalDeliveryStatus === 'delivered'
              ? r.outcomeReason || 'Adgangspakke leveret'
              : r.finalDeliveryStatus === 'approval_only' ||
                  (r.status === 'granted' && !r.finalPackageDelivered)
                ? 'Godkendt — afventer billetter/adgang'
                : r.status === 'granted'
                  ? r.outcomeReason || r.accessRequested || 'Adgang givet'
                  : r.status === 'denied'
                    ? r.outcomeReason || 'Afvist'
                    : null,
          updatedAt: r.updatedAt || r.createdAt || '',
        };
      })
    )
  ).sort((a, b) => {
    // Granted first (clearest result), then by updatedAt
    if (a.overviewStatus === 'granted' && b.overviewStatus !== 'granted') return -1;
    if (b.overviewStatus === 'granted' && a.overviewStatus !== 'granted') return 1;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });

  const counts: Record<string, number> = {
    all: tickets.length,
    granted: 0,
    denied: 0,
    pending: 0,
    researching: 0,
    sent_awaiting_reply: 0,
    follow_up_due: 0,
    escalated: 0,
    paused: 0,
  };
  for (const t of tickets) {
    const key = t.overviewStatus;
    counts[key] = (counts[key] || 0) + 1;
  }

  const automationAudit = (await readAuditEvents())
    .filter((e) => e.type === 'automation_on' || e.type === 'automation_off')
    .slice(-8)
    .reverse();

  return NextResponse.json(
    createSuccessResponse(
      {
        control,
        tickets,
        counts,
        automationAudit,
      },
      { requestId }
    )
  );
}
