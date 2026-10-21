import type { Transaction } from 'firebase-admin/firestore';
import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import { assertMailOwner } from '@/lib/editorial-mail/service';
import type { McpIdentity } from '@/lib/mcp/oauth';
import type { MailMessage } from '@/lib/editorial-mail/mailbox';
import { COLLECTIONS, requireFirestore, stripUndefined } from './persistence/firestore-kit';
import { accreditationCaseHash, assertCaseOwner, getAccreditationRequest, normalizeAccreditationText } from './mcp-context';
import { accredSaveCaseInput, accreditationCaseFields, accredOutcomeInput, accredLinkMailInput, accredSyncInput } from './mcp-contract';
import { assertTransition } from './state-machine';
import { syncRequestToSheet } from './sheet-client';
import { getRequestById } from './request-store';
import type { AccreditationRequest, AccreditationEmailThread } from './types';

export const caseRef = (id: string) => requireFirestore().collection(COLLECTIONS.requests).doc(id);
export const operationRef = (uid: string, id: string) => requireFirestore().collection('accreditationMcpOperations').doc(hash({ uid, id }));
export function checkCase(identity: McpIdentity, row: AccreditationRequest | undefined, expectedHash: string) {
  assertCaseOwner(identity, row);
  if (accreditationCaseHash(row) !== expectedHash) throw Error('mcp_accreditation_case_changed');
  return row;
}
export function recordCaseAudit(tx: Transaction, operationKey: string, requestId: string, type: string) {
  tx.create(requireFirestore().collection(COLLECTIONS.audit).doc(operationKey), { id: operationKey, requestId, type,
    detail: 'Owner MCP operation; source evidence retained on the case. No automatic send.', createdAt: new Date().toISOString() });
}
export async function saveAccreditationRequest(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity, 'apropos:draft'); const input = accredSaveCaseInput.parse(raw), db = requireFirestore();
  const op = operationRef(identity.uid, input.operationId);
  const requestId = await db.runTransaction(async tx => {
    const prior = (await tx.get(op)).data();
    if (prior) { if (prior.inputHash !== hash(input)) throw Error('mcp_accreditation_operation_conflict'); return prior.requestId as string; }
    const counter = db.collection(COLLECTIONS.idCounter).doc('request');
    const existing = input.requestId ? (await tx.get(caseRef(input.requestId))).data() as AccreditationRequest | undefined : undefined;
    if (input.requestId) checkCase(identity, existing, input.expectedHash || '');
    else if (input.expectedHash !== null) throw Error('mcp_accreditation_case_changed');
    const fields = accreditationCaseFields.parse({ ...Object.fromEntries(Object.keys(accreditationCaseFields.shape).filter(k => existing && k in existing).map(k => [k, existing![k as keyof AccreditationRequest]])), ...input.fields });
    if (existing && ['sent_awaiting_reply', 'replied', 'granted', 'denied', 'closed'].includes(existing.status)) {
      for (const key of ['artist', 'venue', 'eventDate', 'contactEmail'] as const)
        if (fields[key] !== existing[key]) throw Error('mcp_accreditation_sent_identity_locked');
    }
    const all = (await tx.get(db.collection(COLLECTIONS.requests))).docs.map(d => d.data() as AccreditationRequest);
    const eventKey = (r: Pick<AccreditationRequest, 'artist' | 'venue' | 'eventDate'>) => normalizeAccreditationText(`${r.artist}|${r.venue}|${r.eventDate}`);
    if (all.some(r => r.id !== existing?.id && eventKey(r) === eventKey(fields))) throw Error('mcp_accreditation_existing_case_required');
    if (all.some(r => r.id === existing?.id && r.mcp && r.pendingApprovalId)) {
      const approval = (await tx.get(db.collection(COLLECTIONS.approvals).doc(existing!.pendingApprovalId!))).data();
      if (approval?.mcp && ['sending', 'unconfirmed'].includes(approval.mcp.status)) throw Error('mcp_accreditation_send_unconfirmed');
    }
    const count = existing ? 0 : Number((await tx.get(counter)).data()?.next || 1);
    const id = existing?.id || `LIV-${String(count).padStart(3, '0')}`;
    if (!existing && (!Number.isSafeInteger(count) || count < 1 || all.some(r => r.id === id))) throw Error('mcp_accreditation_counter_conflict');
    const now = new Date().toISOString();
    const next: AccreditationRequest = { ...existing, ...fields, id, senderMailbox: 'liv@aproposmagazine.com',
      status: existing?.status || 'researching', createdAt: existing?.createdAt || now, updatedAt: now,
      mcp: { ownerUid: identity.uid, revision: (existing?.mcp?.revision || 0) + 1, evidence: [...(existing?.mcp?.evidence || []), ...input.evidence].slice(-100) } };
    tx.set(caseRef(id), stripUndefined(next));
    if (!existing) tx.set(counter, { next: count + 1, updatedAt: now }, { merge: true });
    tx.create(op, { inputHash: hash(input), requestId: id, createdAt: now });
    recordCaseAudit(tx, op.id, id, existing ? 'mcp_case_updated' : 'mcp_case_created');
    return id;
  });
  return getAccreditationRequest(identity, { requestId });
}
export async function setAccreditationOutcome(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity, 'apropos:draft'); const input = accredOutcomeInput.parse(raw), db = requireFirestore(), op = operationRef(identity.uid, input.operationId);
  await db.runTransaction(async tx => {
    const prev = (await tx.get(op)).data();
    if (prev) { if (prev.inputHash !== hash(input)) throw Error('mcp_accreditation_operation_conflict'); return; }
    const row = checkCase(identity, (await tx.get(caseRef(input.requestId))).data() as AccreditationRequest | undefined, input.expectedHash);
    if (!row.mcp) throw Error('mcp_accreditation_adopt_case_first');
    if (row.pendingApprovalId) {
      const approval = (await tx.get(db.collection(COLLECTIONS.approvals).doc(row.pendingApprovalId))).data();
      if (approval?.mcp && ['sending', 'unconfirmed'].includes(approval.mcp.status)) throw Error('mcp_accreditation_send_unconfirmed');
    }
    if (input.status === 'resume' && row.status !== 'paused') throw Error('mcp_accreditation_not_paused');
    // Resume only returns to research. Existing thread alone is not evidence of a sent application.
    const resumed = input.status === 'resume' ? 'researching' : input.status;
    assertTransition(row.status, resumed);
    const now = new Date().toISOString();
    tx.set(caseRef(row.id), stripUndefined({ ...row, status: resumed, paused: resumed === 'paused', outcomeReason: input.reason,
      ...(input.status === 'granted' && row.status !== 'granted' ? { finalDeliveryStatus: row.finalDeliveryStatus === 'package_ready' ? 'package_ready' : 'approval_only', finalPackageDelivered: false } : {}),
      mcp: { ...row.mcp, revision: row.mcp.revision + 1, evidence: [...row.mcp.evidence, input.evidence].slice(-100) }, updatedAt: now }));
    tx.create(op, { inputHash: hash(input), requestId: row.id, createdAt: now }); recordCaseAudit(tx, op.id, row.id, 'mcp_outcome_recorded');
  });
  return getAccreditationRequest(identity, { requestId: input.requestId });
}
/** Link only a previously owner-read, intact mail. No mailbox poll, AI classifier or attachment fetch. */
export async function linkAccreditationMail(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity, 'apropos:draft'); const input = accredLinkMailInput.parse(raw), db = requireFirestore(), op = operationRef(identity.uid, input.operationId);
  await db.runTransaction(async tx => {
    const prev = (await tx.get(op)).data();
    if (prev) { if (prev.inputHash !== hash(input)) throw Error('mcp_accreditation_operation_conflict'); return; }
    const row = checkCase(identity, (await tx.get(caseRef(input.requestId))).data() as AccreditationRequest | undefined, input.expectedHash);
    if (!row.mcp || !row.threadId) throw Error('mcp_accreditation_adopt_case_first');
    const source = (await tx.get(db.collection('editorialMailMessages').doc(hash({ uid: identity.uid, messageId: input.messageId })))).data();
    const mail = source?.message as MailMessage | undefined;
    if (source?.uid !== identity.uid || !mail || mail.sourceHash !== input.expectedSourceHash || mail.folder !== 'inbox' || mail.bodyTruncated)
      throw Error('mcp_accreditation_mail_source_changed');
    const ref = db.collection(COLLECTIONS.emailThreads).doc(row.threadId), thread = (await tx.get(ref)).data() as AccreditationEmailThread | undefined;
    if (!thread || thread.requestId !== row.id || mail.from.toLowerCase() !== row.contactEmail?.toLowerCase() || mail.replyTo.toLowerCase() !== row.contactEmail?.toLowerCase())
      throw Error('mcp_accreditation_mail_contact_mismatch');
    const correlated = mail.subject.includes(`[${row.id}]`) || thread.messages.some(m => m.messageId && mail.references.includes(m.messageId));
    if (!correlated) throw Error('mcp_accreditation_mail_case_mismatch');
    const now = new Date().toISOString();
    if (!thread.messages.some(m => (m.messageId === mail.messageId && !!mail.messageId) || m.id === `msg-${input.messageId.slice(0, 32)}`)) {
      assertTransition(row.status, 'replied');
      tx.set(ref, stripUndefined({ ...thread, messages: [...thread.messages, { id: `msg-${input.messageId.slice(0, 32)}`, direction: 'inbound',
        messageId: mail.messageId || undefined, from: mail.from, to: mail.to.join(', '), subject: mail.subject, text: mail.body, receivedAt: mail.receivedAt || now, untrusted: true }], status: 'replied', updatedAt: now }));
      tx.set(caseRef(row.id), { ...row, status: 'replied', updatedAt: now, mcp: { ...row.mcp, revision: row.mcp.revision + 1 } });
    }
    tx.create(op, { inputHash: hash(input), requestId: row.id, createdAt: now }); recordCaseAudit(tx, op.id, row.id, 'mcp_mail_linked');
  });
  return getAccreditationRequest(identity, { requestId: input.requestId });
}
export async function syncAccreditationSheet(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity, 'apropos:draft'); const input = accredSyncInput.parse(raw), db = requireFirestore();
  const job = db.collection('accreditationMcpSheetSync').doc(hash({ uid: identity.uid, requestId: input.requestId }));
  const claimed = await db.runTransaction(async tx => {
    const prior = (await tx.get(job)).data();
    const row = (await tx.get(caseRef(input.requestId))).data() as AccreditationRequest | undefined; assertCaseOwner(identity, row);
    if (prior && ['sending', 'unconfirmed'].includes(prior.status)) throw Error('mcp_accreditation_sheet_sync_unconfirmed');
    if (prior?.expectedHash === input.expectedHash && prior.status === 'synced') return null;
    checkCase(identity, row, input.expectedHash);
    if (!row.mcp) throw Error('mcp_accreditation_adopt_case_first');
    tx.set(job, { expectedHash: input.expectedHash, status: 'sending', attemptedAt: new Date().toISOString() }); return row;
  });
  if (claimed) {
    try {
      const result = await syncRequestToSheet(claimed, { lastAction: 'Owner MCP workflow sync', emailThreadSource: claimed.threadId });
      if (!result.rowNumber) throw Error('missing_sheet_receipt');
      await db.runTransaction(async tx => {
        const current = (await tx.get(caseRef(claimed.id))).data() as AccreditationRequest;
        tx.update(job, { status: 'synced', rowNumber: result.rowNumber, completedAt: new Date().toISOString() });
        if (accreditationCaseHash(current) === input.expectedHash) tx.update(caseRef(claimed.id), { sheetRowNumber: result.rowNumber });
      });
    } catch {
      await job.update({ status: 'unconfirmed' }).catch(() => undefined);
      throw Error('mcp_accreditation_sheet_sync_unconfirmed');
    }
  }
  return { requestId: input.requestId, synced: (await job.get()).data(), fresh: await getAccreditationRequest(identity, { requestId: input.requestId }), contactsModified: false, paidAiCalls: 0 };
}
