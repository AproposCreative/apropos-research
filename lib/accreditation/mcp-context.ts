import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import type { McpIdentity } from '@/lib/mcp/oauth';
import { assertMailOwner } from '@/lib/editorial-mail/service';
import { readRequests, getRequestById } from './request-store';
import { pullContacts, pullMailboxContactArchive, pullWorkflowRows } from './sheet-client';
import { listContactProfiles, getConversationSummary } from './memory-store';
import { readContactOverview } from './imap/contact-overview-store';
import { getThreadsByRequestId } from './email-thread-store';
import { readApprovals } from './approval-store';
import { getAccessPackage } from './attachments';
import { listAuditForRequest } from './audit-store';
import { getAgentControl } from './agent-control';
import { getAccreditationMailIdentityPublic, getMailTransportPublicStatus } from './send-email';
import { getAccreditationOutboundSafetyPublic } from './outbound-safety';
import { voiceModeInstructions, LIV_PROMPT_VERSION } from './liv-system-prompt';
import { STATUS_LABELS_DA } from './state-machine';
import { isAutomatedSenderHeuristic } from './memory-types';
import { ACCREDITATION_WORKFLOW, accredContactInput, accredListInput, accredCaseInput } from './mcp-contract';
import type { AccreditationRequest, SheetContact } from './types';

export const normalizeAccreditationText = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const accreditationCaseHash = (r: AccreditationRequest) => hash(r);
export function assertCaseOwner(identity: McpIdentity, r: AccreditationRequest | undefined): asserts r is AccreditationRequest {
  assertMailOwner(identity);
  if (!r || (r.mcp && r.mcp.ownerUid !== identity.uid)) throw Error('mcp_accreditation_not_found');
}
function summary(r: AccreditationRequest) {
  return { ...r, caseHash: accreditationCaseHash(r), statusLabel: STATUS_LABELS_DA[r.status],
    followUpDue: r.status === 'sent_awaiting_reply' && !!r.nextFollowUpAt && Date.parse(r.nextFollowUpAt) <= Date.now(),
    mode: r.mcp ? 'personal_approval' : 'legacy', automaticSendAllowed: false };
}
export async function listAccreditationRequests(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity); const input = accredListInput.parse(raw);
  const rows = (await readRequests()).filter(r => !r.mcp || r.mcp.ownerUid === identity.uid)
    .filter(r => (!input.status || r.status === input.status) && (!input.query || normalizeAccreditationText(JSON.stringify(r)).includes(normalizeAccreditationText(input.query))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const next = input.offset + input.limit;
  return { requests: rows.slice(input.offset, next).map(summary), total: rows.length, nextOffset: next < rows.length ? next : null,
    checkedAt: new Date().toISOString(), paidAiCalls: 0, instruction: ACCREDITATION_WORKFLOW };
}

type ContactSource = { source: string; contact: SheetContact; checkedAt: string; notes?: string; reviewStatus?: string; facts?: Record<string, string> };
/** Preserve conflicting source claims; never turn a mail scan into a verified press relationship. */
export async function accreditationContacts() {
  const checkedAt = new Date().toISOString();
  const results = await Promise.allSettled([pullContacts({ allRows: true }), pullMailboxContactArchive({ allRows: true }), listContactProfiles(), readContactOverview(), pullWorkflowRows({ allRows: true })]);
  const sources = ['contacts_sheet', 'mailbox_archive_sheet', 'relationship_memory', 'imap_contact_overview', 'workflow_sheet'];
  const availability = results.map((r, i) => ({ source: sources[i], available: r.status === 'fulfilled',
    ...(i === 0 || i === 1 || i === 4 ? { coverage: 'All populated rows in the configured sheet columns. Existing archive, not a fresh mailbox scan.' } : {}) }));
  const entries: ContactSource[] = [];
  const add = (source: string, contact: SheetContact, extra: Partial<ContactSource> = {}) => entries.push({ source, contact, checkedAt, ...extra });
  const [contacts, archive, memory, scanned, workflow] = results;
  if (contacts.status === 'fulfilled') for (const c of contacts.value) add(sources[0], c, { facts: c.raw });
  if (archive.status === 'fulfilled') for (const c of archive.value) add(sources[1], { name: c.name || '', email: c.email, company: c.company, role: c.role,
    raw: c.raw, relationshipStatus: c.relationship, sourceMailbox: c.sourceMailbox, messageCount: c.messageCount, isAutomated: c.isAutomated }, { notes: c.notes, facts: c.raw });
  if (memory.status === 'fulfilled') for (const c of memory.value) add(sources[2], { name: c.name || '', email: c.email, company: c.companyHint, role: c.roleHint,
    category: c.category, relationshipStatus: c.relationshipStatus, sourceMailbox: c.sourceMailbox, messageCount: c.interactionCount, raw: {} }, { notes: c.notes, checkedAt: c.updatedAt });
  if (scanned.status === 'fulfilled') for (const c of scanned.value.contacts) add(sources[3], { name: c.name || '', email: c.email, company: c.companyHint,
    sourceMailbox: c.mailboxes.join(', '), messageCount: c.messageCount, raw: {} }, { reviewStatus: c.reviewStatus, checkedAt: c.lastSeenAt || scanned.value.lastScanAt || checkedAt });
  if (workflow.status === 'fulfilled') for (const c of workflow.value) add(sources[4], { name: c.contactName, email: c.contactEmail, company: c.promoter, raw: {} },
    { notes: `Historical case ${c.requestId}: ${c.artist}; ${c.venue}; ${c.eventDate}; ${c.status}. ${c.notes}` });
  const grouped = new Map<string, ContactSource[]>();
  for (const e of entries) {
    const key = e.contact.email?.trim().toLowerCase() || `no-email:${normalizeAccreditationText(e.contact.name + ' ' + (e.contact.company || ''))}`;
    grouped.set(key, [...(grouped.get(key) || []), e]);
  }
  const rows = [...grouped].map(([key, evidence]) => {
    const c = evidence.find(e => e.source === 'relationship_memory')?.contact || evidence[0].contact;
    const blockers = [...new Set(evidence.flatMap(e => [
      ...(e.contact.relationshipStatus === 'do_not_contact' || Object.entries(e.contact.raw || {}).some(([k, v]) => /relationship|relation|status|contact.?allowed/i.test(k) && /do.not.contact|fravalgt|rejected|afvist|kontakt.ikke/i.test(v)) ? ['do_not_contact'] : []),
      ...(e.reviewStatus === 'rejected' ? ['rejected_contact'] : []),
      ...(e.contact.isAutomated || e.contact.category === 'automated' || isAutomatedSenderHeuristic({ email: e.contact.email, name: e.contact.name }) ? ['automated_contact'] : []),
    ]))];
    return { key, email: key.startsWith('no-email:') ? null : key, name: c.name, company: c.company || null, role: c.role || null,
      relationship: c.relationshipStatus || 'unknown', blockers, evidence, sourceHash: hash({ evidence: evidence.map(({ checkedAt: _time, ...e }) => e) }) };
  });
  return { rows, availability, checkedAt };
}
export async function searchAccreditationContacts(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity); const input = accredContactInput.parse(raw);
  const request = input.requestId ? await getRequestById(input.requestId) : undefined;
  if (input.requestId) assertCaseOwner(identity, request);
  const result = await accreditationContacts();
  const rows = result.rows.filter(c => !input.query || normalizeAccreditationText(JSON.stringify(c)).includes(normalizeAccreditationText(input.query)))
    .map(c => ({ ...c, contextMatches: request ? [request.artist, request.venue, request.promoter].filter((s): s is string => !!s && s.length >= 3)
      .filter(s => normalizeAccreditationText(JSON.stringify(c.evidence)).includes(normalizeAccreditationText(s))) : [] }))
    .sort((a, b) => b.contextMatches.length - a.contextMatches.length || a.key.localeCompare(b.key));
  const next = input.offset + input.limit;
  return { contacts: rows.slice(input.offset, next), total: rows.length, nextOffset: next < rows.length ? next : null,
    availability: result.availability, checkedAt: result.checkedAt, untrustedContent: true, paidAiCalls: 0,
    note: 'Read-only lookup. Existing source limits are explicit; failures are not zero contacts. No source is a new verification of event responsibility. No mail bodies, IMAP scan, contact import or sheet write.' };
}
export async function assertAccreditationContactAllowed(email: string) {
  const result = await accreditationContacts();
  if (result.availability.some(s => !s.available && s.source !== 'workflow_sheet')) throw Error('mcp_accreditation_contact_checks_unavailable');
  if (result.rows.find(c => c.email === email.toLowerCase())?.blockers.length || isAutomatedSenderHeuristic({ email }))
    throw Error('mcp_accreditation_contact_blocked');
}
export async function getAccreditationContext(identity: McpIdentity) {
  assertMailOwner(identity);
  const [cases, control] = await Promise.all([listAccreditationRequests(identity, { limit: 20 }), getAgentControl()]);
  return { ...cases, control, transport: getMailTransportPublicStatus(), mailIdentity: getAccreditationMailIdentityPublic(),
    safety: getAccreditationOutboundSafetyPublic(), voice: voiceModeInstructions('external_mail'), promptVersion: LIV_PROMPT_VERSION,
    contactSources: ['Contacts etc.', 'Mailbox contact archive', 'relationship memory', 'IMAP contact overview', 'Accreditation workflow'],
    automaticSettingsChanged: false, instructions: ACCREDITATION_WORKFLOW };
}
export async function getAccreditationRequest(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity); const { requestId, messageOffset } = accredCaseInput.parse(raw);
  const request = await getRequestById(requestId); assertCaseOwner(identity, request);
  const [threads, approvals, accessPackage, memory, audit] = await Promise.all([getThreadsByRequestId(requestId), readApprovals(), getAccessPackage(requestId), getConversationSummary(requestId), listAuditForRequest(requestId)]);
  const messages = threads.flatMap(t => t.messages.map(m => ({ ...m, threadId: t.id }))).sort((a, b) => (a.receivedAt || a.sentAt || '').localeCompare(b.receivedAt || b.sentAt || ''));
  return { request: summary(request), threads: threads.map(({ messages: _messages, ...t }) => t),
    messages: messages.slice(messageOffset, messageOffset + 20).map(({ html: _html, text, ...m }) => ({ ...m, text: (text || '').slice(0, 12000), truncated: (text || '').length > 12000 })),
    nextMessageOffset: messageOffset + 20 < messages.length ? messageOffset + 20 : null, totalMessages: messages.length,
    approvals: approvals.filter(a => a.requestId === requestId).map(a => ({ id: a.id, kind: a.kind, status: a.status, to: a.to, subject: a.subject,
      updatedAt: a.updatedAt, revision: a.mcp?.revision, sendStatus: a.mcp?.status, ownerPreview: !!a.mcp })),
    accessPackage: accessPackage || null, conversationSummary: memory || null, audit: audit.slice(-50),
    auditTruncated: audit.length > 50, paidAiCalls: 0, untrustedContent: true, instruction: ACCREDITATION_WORKFLOW };
}
