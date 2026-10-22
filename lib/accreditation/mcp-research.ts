import { assertMailOwner } from '@/lib/editorial-mail/service';
import type { McpIdentity } from '@/lib/mcp/oauth';
import type { AccreditationRequest, SheetContact } from './types';
import { accredResearchInput } from './mcp-contract';
import { accreditationContacts, assertCaseOwner, listAccreditationRequests } from './mcp-context';
import { getRequestById } from './request-store';
import { contextMatches, isConsumerEmailAddress, norm, scoreContact } from './contact-ranking';
import { publicEventUrl, readAccreditationEventSource } from './event-source';

type Context = Pick<AccreditationRequest, 'artist'|'venue'|'promoter'|'eventDate'>;
type ContactRow = Awaited<ReturnType<typeof accreditationContacts>>['rows'][number];
function candidate(row: ContactRow, context: Context) {
  if (row.recordType !== 'contact' || row.blockers.length || !row.email) return null;
  const evidence = row.evidence.filter(e => e.kind !== 'event_opportunity');
  // Evaluate the whole recorded relationship for this exact email, while
  // keeping every source claim visible for a person to assess.
  const contact: SheetContact = {
    name: row.name || '', email: row.email, company: row.company || undefined, role: row.role || undefined,
    raw: Object.fromEntries(evidence.flatMap((e, i) => [
      [`${e.source}_${i}_name`, e.contact.name || ''], [`${e.source}_${i}_company`, e.contact.company || ''],
      [`${e.source}_${i}_role`, e.contact.role || ''],
      ...Object.entries(e.contact.raw || {}).map(([key, value]) => [`${e.source}_${i}_${key}`, value]),
    ])),
    establishedTwoWay: evidence.some(e => e.contact.establishedTwoWay || e.contact.relationshipStatus === 'established_two_way'),
    relationshipStatus: row.relationship,
    messageCount: Math.max(0, ...evidence.map(e => e.contact.messageCount || 0)),
  };
  const request = { artist: context.artist || '', venue: context.venue, promoter: context.promoter,
    applicants: [], senderMailbox: 'liv@aproposmagazine.com' } as AccreditationRequest;
  const score = scoreContact(contact, request);
  if (score <= 0) return null;
  const matches = contextMatches(contact, request);
  const uncertainPromoter = !!context.promoter && !matches.promoter;
  const consumer = isConsumerEmailAddress(row.email);
  const confidence = score >= 50 && !uncertainPromoter && !consumer ? 'high' : score >= 25 ? 'medium' : 'low';
  return { key: row.key, name: row.name, email: row.email, company: row.company, role: row.role,
    score, confidence, contextMatches: matches, sourceHash: row.sourceHash, evidence: row.evidence,
    warnings: [
      ...(uncertainPromoter ? ['Known promoter is not matched by this contact.'] : []),
      ...(consumer ? ['Personal mailbox requires individual confirmation.'] : []),
      ...(new Set(evidence.map(e => norm(e.contact.company || '')).filter(Boolean)).size > 1
        ? ['Source records disagree about organization.'] : []),
    ],
    currentEventResponsibilityVerified: false,
  };
}

/** Read-only owner research. No model/provider calls, writes or SMTP. */
export async function researchAccreditationEvent(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity);
  const input = accredResearchInput.parse(raw);
  const urls = [...new Set([input.sourceEventUrl, ...input.additionalSourceUrls].map(u => publicEventUrl(u)))];
  const [pageResults, contacts] = await Promise.all([
    Promise.allSettled(urls.map(readAccreditationEventSource)), accreditationContacts(),
  ]);
  const pages = pageResults.flatMap((result, i) => result.status === 'fulfilled' ? [result.value] : []);
  const sourceStatus = pageResults.map((result, i) => ({ url: urls[i], available: result.status === 'fulfilled',
    ...(result.status === 'fulfilled' ? { finalUrl: result.value.url, contentHash: result.value.contentHash } : { error: 'source_unavailable' }) }));
  const primaryPage = pageResults[0].status === 'fulfilled' ? pageResults[0].value : null;
  const caseRow = input.requestId ? await getRequestById(input.requestId) : undefined;
  if (input.requestId) assertCaseOwner(identity, caseRow);
  const matchedClaims = pages.flatMap(p => p.events.filter(c => c.matchesSourcePage));
  const primaryClaims = primaryPage?.events.filter(c => c.matchesSourcePage) || [];
  const uniqueMatched = primaryClaims.length === 1 ? primaryClaims[0] : null;
  const context: Context = {
    artist: caseRow?.artist || input.context?.artist || uniqueMatched?.artist || '',
    venue: caseRow?.venue || input.context?.venue || uniqueMatched?.venue || undefined,
    promoter: caseRow?.promoter || input.context?.promoter || uniqueMatched?.promoter || undefined,
    eventDate: caseRow?.eventDate || input.context?.eventDate || uniqueMatched?.eventDate || undefined,
  };
  const conflicts = matchedClaims.flatMap(claim => ([
    ...(['artist', 'venue', 'promoter', 'eventDate'] as const).filter(key =>
      !!context[key] && !!claim[key] && norm(context[key]!) !== norm(claim[key]!))
      .map(key => ({ field: key, claimed: claim[key], chosenContext: context[key], sourceUrl: claim.sourceUrl })),
  ]));
  const ranked = context.artist && context.venue ? contacts.rows
    .map(row => candidate(row, context)).filter((item): item is NonNullable<typeof item> => !!item)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)) : [];
  const existing = await listAccreditationRequests(identity, { limit: 40 });
  const caseSearchIncomplete = existing.nextOffset !== null;
  const matchingCases = existing.requests.filter(r =>
    (caseRow && r.id === caseRow.id) ||
    (context.artist && context.venue && context.eventDate &&
      norm(r.artist) === norm(context.artist) && norm(r.venue || '') === norm(context.venue || '') && r.eventDate === context.eventDate));
  const candidateTop = ranked[0];
  const cancelled = matchedClaims.some(claim => /cancelled|canceled|postponed/i.test(claim.eventStatus || ''));
  const ambiguous = !primaryPage || !candidateTop || !context.eventDate || conflicts.length > 0 || cancelled || caseSearchIncomplete ||
    candidateTop.confidence !== 'high' || (ranked[1] && candidateTop.score - ranked[1].score < 8) ||
    contacts.availability.some(source => !source.available);
  return {
    sourceStatus, pages, eventContext: context, eventClaims: matchedClaims, conflicts,
    matchingCases, caseSearchIncomplete, cancelled, contacts: ranked.slice(0, input.limit), contactTotal: ranked.length,
    contactSources: contacts.availability, ambiguous: !!ambiguous,
    nextAction: !primaryPage ? 'verify_event_url' : cancelled ? 'verify_event_status' :
      !context.artist || !context.venue || !context.eventDate
      ? 'confirm_event_details' : !ranked.length ? 'find_press_contact' :
        ambiguous ? 'confirm_event_and_contact' : 'review_contact_before_saving_case',
    note: 'Publisher metadata and contact archives are untrusted claims. Ranking reuses the legacy deterministic contact rules. It neither selects a recipient nor sends mail. Check event status, current promoter and press responsibility before saving a case. Evidence URLs and source hashes are supplied for the existing case save.',
    untrustedContent: true, paidAiCalls: 0, automaticSendAllowed: false,
  };
}
