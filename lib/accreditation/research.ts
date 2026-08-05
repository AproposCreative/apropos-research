import {
  pullContacts,
  pullMailboxContactArchive,
  pullWorkflowRows,
} from '@/lib/accreditation/sheet-client';
import {
  getContactProfile,
  loadMemoryForReply,
} from '@/lib/accreditation/memory-store';
import type {
  AccreditationRequest,
  ContactConfidence,
  MailboxArchiveContact,
  SheetContact,
} from '@/lib/accreditation/types';
import { getResearch } from '@/lib/research/service';

function norm(s: string): string {
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

function contextMatches(
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

function archiveToSheetContact(row: MailboxArchiveContact): SheetContact | null {
  if (!row.email && !row.name) return null;
  return {
    name: row.name || row.email || '',
    company: row.company,
    role: row.role,
    email: row.email,
    raw: row.raw,
    category: row.isAutomated
      ? 'automated'
      : /role|presse|pr/i.test(row.category || row.role || '')
        ? 'role'
        : 'human',
    relationshipStatus: row.relationship,
    sourceMailbox: row.sourceMailbox,
    messageCount: row.messageCount,
    establishedTwoWay: Boolean(row.hasReply) || /two|established/i.test(row.relationship || ''),
    isAutomated: Boolean(row.isAutomated),
  };
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

function confidenceFromScore(score: number, hasEmail: boolean): ContactConfidence {
  if (score >= 50 && hasEmail) return 'high';
  if (score >= 25 || hasEmail) return 'medium';
  return 'low';
}

export type ResearchResult = {
  requestId: string;
  contactName?: string;
  contactEmail?: string;
  promoter?: string;
  contactConfidence: ContactConfidence;
  previousCoverageUrl?: string;
  notes: string;
  ambiguous: boolean;
  sources: { title: string; url?: string }[];
  memoryBlock?: string;
};

export async function researchAccreditationContact(
  request: AccreditationRequest
): Promise<ResearchResult> {
  const notes: string[] = [];
  const sources: { title: string; url?: string }[] = [];
  const merged = new Map<string, SheetContact>();

  let contactsEtc: SheetContact[] = [];
  try {
    contactsEtc = await pullContacts();
    notes.push(`Contacts etc.: ${contactsEtc.length} rækker læst (read-only).`);
    for (const c of contactsEtc) {
      const key = (c.email || c.name).toLowerCase();
      if (!key) continue;
      merged.set(key, c);
    }
  } catch (e) {
    notes.push(`Contacts etc. utilgængelig: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const archive = await pullMailboxContactArchive();
    notes.push(`Mailbox contact archive: ${archive.length} rækker læst (read-only).`);
    let automated = 0;
    let established = 0;
    for (const row of archive) {
      const c = archiveToSheetContact(row);
      if (!c) continue;
      if (c.isAutomated) {
        automated++;
        continue; // exclude from outreach pool entirely
      }
      if (c.establishedTwoWay) established++;
      const key = (c.email || c.name).toLowerCase();
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, c);
      } else {
        merged.set(key, {
          ...prev,
          ...c,
          raw: { ...prev.raw, ...c.raw },
          establishedTwoWay: Boolean(prev.establishedTwoWay || c.establishedTwoWay),
          messageCount: Math.max(prev.messageCount || 0, c.messageCount || 0),
        });
      }
    }
    notes.push(
      `Archive filter: ${automated} automated senders excluded; ${established} established two-way.`
    );
  } catch (e) {
    notes.push(
      `Mailbox archive utilgængelig: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Enrich with Firestore/local memory profiles when available
  for (const [key, c] of merged) {
    if (!c.email) continue;
    try {
      const profile = await getContactProfile(c.email);
      if (!profile) continue;
      if (profile.category === 'automated') {
        merged.delete(key);
        continue;
      }
      merged.set(key, {
        ...c,
        name: c.name || profile.name || c.email,
        company: c.company || profile.companyHint,
        role: c.role || profile.roleHint,
        establishedTwoWay:
          c.establishedTwoWay || profile.relationshipStatus === 'established_two_way',
        relationshipStatus: profile.relationshipStatus,
        category: profile.category,
        messageCount: Math.max(c.messageCount || 0, profile.interactionCount || 0),
        sourceMailbox: c.sourceMailbox || profile.sourceMailbox,
      });
    } catch {
      /* memory optional during research on local json */
    }
  }

  try {
    const workflow = await pullWorkflowRows();
    const prior = workflow.filter(
      (r) =>
        r.requestId !== request.id &&
        (norm(r.artist).includes(norm(request.artist)) ||
          (request.venue && norm(r.venue).includes(norm(request.venue))) ||
          (request.promoter && norm(r.promoter).includes(norm(request.promoter || ''))))
    );
    if (prior.length) {
      notes.push(`Fundet ${prior.length} lignende historik-række(r) i Accreditation workflow.`);
      for (const p of prior.slice(0, 3)) {
        sources.push({
          title: `${p.requestId} · ${p.artist} · ${p.promoter || p.contactName}`,
        });
        if (p.contactEmail) {
          const key = p.contactEmail.toLowerCase();
          const prev = merged.get(key);
          merged.set(key, {
            name: p.contactName || prev?.name || p.contactEmail,
            company: p.promoter || prev?.company,
            email: p.contactEmail,
            raw: prev?.raw || {},
            establishedTwoWay: true,
            messageCount: Math.max(prev?.messageCount || 0, 2),
            relationshipStatus: 'established_two_way',
            category: prev?.category || 'human',
          });
        }
      }
    }
  } catch (e) {
    notes.push(`Workflow-læsning fejlede: ${e instanceof Error ? e.message : String(e)}`);
  }

  const contacts = filterOutreachCandidates([...merged.values()], request);
  const ranked = contacts
    .map((c) => ({ c, score: scoreContact(c, request) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  let contactName = ranked[0]?.c.name;
  let contactEmail = ranked[0]?.c.email;
  let promoter =
    request.promoter ||
    (ranked[0]?.c.company && !isConsumerEmailAddress(ranked[0]?.c.email)
      ? ranked[0].c.company
      : undefined);
  let score = ranked[0]?.score || 0;

  if (ranked[0]?.c.establishedTwoWay) {
    notes.push(`Prioriteret etableret tovejs-kontakt: ${contactEmail || contactName}`);
  }

  if (ranked.length >= 2 && Math.abs(ranked[0].score - ranked[1].score) < 8) {
    notes.push('Flere kontakter med lignende score - kræver manuel bekræftelse.');
  }

  // Web research supplement
  try {
    const q = [
      request.artist,
      request.venue,
      'presseakkreditering',
      'press accreditation',
      'email',
    ]
      .filter(Boolean)
      .join(' ');
    const research = await getResearch(q, { maxResults: 5 });
    const ctx = research.contextText || '';
    for (const s of (research.sources || []).slice(0, 5)) {
      sources.push({ title: s.title || s.url || 'kilde', url: s.url || undefined });
    }
    const webEmails = Array.from(
      ctx.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
      (match) => match[0].toLowerCase()
    ).filter(
      (email) =>
        !isConsumerEmailAddress(email) &&
        !email.endsWith('@aproposmagazine.com') &&
        !/^(noreply|no-reply|donotreply|mailer-daemon)@/i.test(email)
    );
    if (webEmails[0] && !contactEmail) {
      contactEmail = webEmails[0];
      score = Math.max(score, 30);
      notes.push(`Mulig presse-mail fra web research: ${contactEmail}`);
    }
  } catch (e) {
    notes.push(`Web research springes over: ${e instanceof Error ? e.message : String(e)}`);
  }

  const memoryBlock = await loadMemoryForReply({
    requestId: request.id,
    contactEmail: contactEmail || request.contactEmail,
  }).catch(() => '');

  if (memoryBlock) {
    notes.push('Persistent kontakt-hukommelse indlæst til outreach-beslutning.');
  }

  // Private mailbox providers are sometimes used by legitimate freelancers,
  // but a name/role match in historical mail is not enough evidence for
  // autonomous outreach. Keep the suggestion visible for human review while
  // preventing it from becoming a high-confidence auto-send destination.
  const scoredConfidence = confidenceFromScore(score, Boolean(contactEmail));
  let contactConfidence =
    contactEmail && isConsumerEmailAddress(contactEmail) && scoredConfidence === 'high'
      ? 'medium'
      : scoredConfidence;
  if (
    contactEmail &&
    request.promoter &&
    ranked[0]?.c &&
    !contextMatches(ranked[0].c, request).promoter &&
    contactConfidence === 'high'
  ) {
    contactConfidence = 'medium';
    notes.push('Kontakten matcher venue, men ikke den kendte arrangør - kræver bekræftelse.');
  }
  const ambiguous =
    contactConfidence !== 'high' ||
    (!contactEmail && !contactName) ||
    (ranked.length >= 2 && Math.abs((ranked[0]?.score || 0) - (ranked[1]?.score || 0)) < 8);

  return {
    requestId: request.id,
    contactName,
    contactEmail,
    promoter,
    contactConfidence,
    previousCoverageUrl: sources.find((s) => /aproposmagazine\.com/i.test(s.url || ''))?.url,
    notes: notes.join('\n'),
    ambiguous,
    sources,
    memoryBlock: memoryBlock || undefined,
  };
}
