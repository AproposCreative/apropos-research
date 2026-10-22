import type { AccreditationRequest, ContactConfidence, SheetContact } from './types';

/** Shared deterministic legacy/MCP ranking. No IO, model calls or send. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.dk',
  'live.com',
  'live.dk',
  'outlook.com',
  'outlook.dk',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
]);

function contactEmailDomain(email?: string): string {
  return (email || '').trim().toLowerCase().split('@')[1] || '';
}

export function isConsumerEmailAddress(email?: string): boolean {
  return CONSUMER_EMAIL_DOMAINS.has(contactEmailDomain(email));
}

function contactHaystack(contact: SheetContact): string {
  return norm(
    [contact.name, contact.company, contact.role, contact.email, ...Object.values(contact.raw)].join(
      ' '
    )
  );
}

function hasPressRoleEvidence(contact: SheetContact): boolean {
  return /\b(presse|press|pr|publicist|communications|media relations|akkredit|accreditation|booking)\b/.test(
    contactHaystack(contact)
  );
}

export function contextMatches(
  contact: SheetContact,
  request: AccreditationRequest
): { artist: boolean; venue: boolean; promoter: boolean } {
  const hay = contactHaystack(contact);
  const matches = (value?: string) => {
    const term = value ? norm(value) : '';
    return term.length >= 3 && hay.includes(term);
  };
  return {
    artist: matches(request.artist),
    venue: matches(request.venue),
    promoter: matches(request.promoter),
  };
}

function matchesRequestContext(
  contact: SheetContact,
  request: AccreditationRequest
): boolean {
  const matches = contextMatches(contact, request);
  if (request.promoter) {
    // A known promoter is the strongest routing fact. A venue match is only
    // enough when the contact also has an explicit press/accreditation role.
    return matches.promoter || (matches.venue && hasPressRoleEvidence(contact));
  }
  return matches.venue || matches.artist;
}

/** A prior dialogue is useful only when the person is relevant to this event. */
export function isOutreachCandidateForRequest(
  contact: SheetContact,
  request: AccreditationRequest
): boolean {
  if (contact.isAutomated || contact.category === 'automated') return false;
  const email = (contact.email || '').trim().toLowerCase();
  if (email.endsWith('@aproposmagazine.com')) return false;
  const internalRecipients = [
    request.deliveryRecipientEmail,
    ...request.applicants.map((applicant) => applicant.email),
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  if (email && internalRecipients.includes(email)) return false;

  const pressRole = hasPressRoleEvidence(contact);
  const contextMatch = matchesRequestContext(contact, request);
  const established =
    Boolean(contact.establishedTwoWay) ||
    /established_two_way|two.?way/i.test(contact.relationshipStatus || '');
  return contextMatch && (pressRole || established);
}

export function scoreContact(contact: SheetContact, request: AccreditationRequest): number {
  if (!isOutreachCandidateForRequest(contact, request)) {
    return -1000;
  }

  const hay = contactHaystack(contact);
  let score = 0;
  const venue = request.venue ? norm(request.venue) : '';
  const artist = norm(request.artist);
  const promoter = request.promoter ? norm(request.promoter) : '';
  if (venue && hay.includes(venue)) score += 40;
  if (promoter && hay.includes(promoter)) score += 35;
  if (artist && hay.includes(artist)) score += 15;
  if (contact.email?.includes('@')) score += 20;
  if (/presse|press|pr|accreditation|akkredit/.test(hay)) score += 10;

  // Prioritize established two-way dialogue from mailbox archive / memory
  if (contact.establishedTwoWay || /established_two_way|two.?way/i.test(contact.relationshipStatus || '')) {
    score += 45;
  }
  if ((contact.messageCount || 0) >= 3) score += 15;
  else if ((contact.messageCount || 0) >= 2) score += 8;

  return score;
}

/** Exported for tests: filter outreach candidates. */
export function filterOutreachCandidates(
  contacts: SheetContact[],
  request?: AccreditationRequest
): SheetContact[] {
  return contacts.filter((contact) =>
    request
      ? isOutreachCandidateForRequest(contact, request)
      : !contact.isAutomated && contact.category !== 'automated'
  );
}

export function confidenceFromScore(score: number, hasEmail: boolean): ContactConfidence {
  if (score >= 50 && hasEmail) return 'high';
  if (score >= 25 || hasEmail) return 'medium';
  return 'low';
}
