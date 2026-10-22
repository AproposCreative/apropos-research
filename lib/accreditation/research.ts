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
import { withSharedCostContext } from '@/lib/liv/cost-context';
import { norm, isConsumerEmailAddress, contextMatches, scoreContact, filterOutreachCandidates, confidenceFromScore } from './contact-ranking';
export { isConsumerEmailAddress, scoreContact, filterOutreachCandidates, isOutreachCandidateForRequest } from './contact-ranking';

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
    const research = await withSharedCostContext({ scope: 'accreditation', stage: 'contact-research' },
      () => getResearch(q, { maxResults: 5, allowFallback: false }));
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
