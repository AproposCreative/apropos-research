import type { AccreditationRequestStatus } from '@/lib/accreditation/types';

const TRANSITIONS: Record<AccreditationRequestStatus, AccreditationRequestStatus[]> = {
  intake: ['researching', 'withdrawn', 'closed', 'paused', 'escalated'],
  researching: ['needs_contact', 'draft_ready', 'stalled', 'withdrawn', 'escalated', 'paused'],
  needs_contact: ['researching', 'draft_ready', 'stalled', 'withdrawn', 'escalated', 'paused'],
  draft_ready: ['awaiting_approval', 'sent_awaiting_reply', 'researching', 'withdrawn', 'escalated', 'paused'],
  awaiting_approval: [
    'sent_awaiting_reply',
    'draft_ready',
    'reply_draft_ready',
    'notifying_applicants',
    'withdrawn',
    'escalated',
    'paused',
  ],
  sent_awaiting_reply: ['replied', 'stalled', 'granted', 'denied', 'withdrawn', 'paused', 'escalated'],
  replied: ['reply_draft_ready', 'granted', 'denied', 'stalled', 'awaiting_approval', 'sent_awaiting_reply', 'escalated'],
  reply_draft_ready: ['awaiting_approval', 'sent_awaiting_reply', 'granted', 'denied', 'withdrawn', 'escalated'],
  granted: ['notifying_applicants', 'closed'],
  denied: ['notifying_applicants', 'closed'],
  withdrawn: ['closed'],
  stalled: ['researching', 'awaiting_approval', 'withdrawn', 'closed', 'sent_awaiting_reply'],
  notifying_applicants: ['closed', 'awaiting_approval', 'escalated'],
  closed: [],
  paused: ['intake', 'researching', 'draft_ready', 'sent_awaiting_reply', 'escalated', 'closed'],
  escalated: [
    'draft_ready',
    'awaiting_approval',
    'sent_awaiting_reply',
    'researching',
    'needs_contact',
    'paused',
    'closed',
    'notifying_applicants',
  ],
};

export function canTransition(
  from: AccreditationRequestStatus,
  to: AccreditationRequestStatus
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: AccreditationRequestStatus,
  to: AccreditationRequestStatus
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid accreditation status transition: ${from} → ${to}`);
  }
}

export const STATUS_LABELS_DA: Record<AccreditationRequestStatus, string> = {
  intake: 'Indtag',
  researching: 'Research',
  needs_contact: 'Mangler kontakt',
  draft_ready: 'Udkast klar',
  awaiting_approval: 'Escalering',
  sent_awaiting_reply: 'Sendt · afventer svar',
  replied: 'Svar modtaget',
  reply_draft_ready: 'Svarudkast klar',
  granted: 'Godkendt',
  denied: 'Afvist',
  withdrawn: 'Trukket tilbage',
  stalled: 'Gået i stå',
  notifying_applicants: 'Notificerer ansøgere',
  closed: 'Lukket',
  paused: 'Pauset',
  escalated: 'Escaleret',
};
