import { createHash } from 'node:crypto';
import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import { digest, opaque, type McpIdentity } from '@/lib/mcp/oauth';
import { assertMailOwner } from '@/lib/editorial-mail/service';
import { COLLECTIONS, requireFirestore, stripUndefined } from './persistence/firestore-kit';
import { getRequestById } from './request-store';
import { getApprovalById } from './approval-store';
import { getThreadsByRequestId } from './email-thread-store';
import { getAccessPackage, readStoredAttachment, validateAttachmentSafety } from './attachments';
import { assertPersonalAccreditationPolicy } from './mcp-personal-policy';
import { getAccreditationFromEmail, getAccreditationReplyTo, sendAccreditationEmail } from './send-email';
import { getSmtpPublicConfig, getAccreditationMailTransport } from './mail-transport';
import { ensureRequestIdInSubject, sanitizeLivOutput } from './sanitize';
import { draftHash } from './draft-template';
import { accreditationMailHtml } from './mcp-mail-content';
import { inspectSentMessage, copyExistingSentMessage } from '@/lib/editorial-mail/imap';
import { applySignature, currentSignature } from '@/lib/editorial-mail/signature';
import { detectEscalationHeuristics } from './policy';
import { accredDraftInput, accredApprovalInput, accredConfirmInput, accredSentRepairInput, accredEmail, ACCREDITATION_WORKFLOW } from './mcp-contract';
import { checkCase, caseRef, operationRef, recordCaseAudit } from './mcp-cases';
import { accreditationCaseHash, assertCaseOwner, assertAccreditationContactAllowed as contactCheck } from './mcp-context';
import type { AccessPackage, AccessPackageAsset, AccreditationRequest, AccreditationEmailThread, ApprovalItem } from './types';

const approvalRef = (id: string) => requireFirestore().collection(COLLECTIONS.approvals).doc(id);
const contentHash = (a: ApprovalItem) => hash({ requestId: a.requestId, kind: a.mcp!.kind, to: a.to, subject: a.subject, text: a.text,
  from: a.mcp!.from, replyTo: a.mcp!.replyTo, assets: a.mcp!.assets, caseHash: a.mcp!.caseHash,
  contextHash: a.mcp!.contextHash, revision: a.mcp!.revision,
  ...(a.mcp!.presentationVersion === 2 ? { presentationVersion: 2, signatureHash: a.mcp!.signatureHash, html: a.html } : {}) });
const contextHash = (thread: AccreditationEmailThread | undefined, pkg: AccessPackage | undefined) => hash({ thread: thread || null, package: pkg || null });
function validateDraft(identity: McpIdentity, row: ApprovalItem | undefined): ApprovalItem & { mcp: NonNullable<ApprovalItem['mcp']> } {
  assertMailOwner(identity);
  if (!row?.mcp || row.mcp.ownerUid !== identity.uid) throw Error('mcp_accreditation_draft_not_found');
  if (contentHash(row) !== row.mcp.contentHash) throw Error('mcp_accreditation_draft_changed');
  return row as ApprovalItem & { mcp: NonNullable<ApprovalItem['mcp']> };
}
function project(a: ApprovalItem & { mcp: NonNullable<ApprovalItem['mcp']> }, request: AccreditationRequest) {
  return { draftId: a.id, approvalId: a.id, requestId: request.id, revision: a.mcp.revision, contentHash: a.mcp.contentHash,
    caseHash: accreditationCaseHash(request), status: a.mcp.status, kind: a.mcp.kind, from: a.mcp.from, fromName: 'Liv Brandt', to: a.to,
    subject: a.subject, body: a.text, cc: [], attachments: a.mcp.assets.map(({ storagePath: _path, ...asset }) => asset),
    event: { artist: request.artist, venue: request.venue, date: request.eventDate, applicants: request.applicants,
      accessRequested: request.accessRequested, ticketQuantity: request.ticketQuantity, promisedCoverage: request.promisedCoverage || null },
    receipt: a.mcp.receipt ? { ...a.mcp.receipt, sentCopyArchived: a.mcp.receipt.sentCopyArchived } : null,
    syncWarning: a.mcp.syncWarning || null, policyFlags: a.policyFlags, updatedAt: a.updatedAt,
    automaticRetryAllowed: false, paidAiCalls: 0, instruction: ACCREDITATION_WORKFLOW };
}
export async function getAccreditationDraft(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity); const { approvalId } = accredApprovalInput.parse(raw);
  const a = validateDraft(identity, await getApprovalById(approvalId));
  const request = await getRequestById(a.requestId); assertCaseOwner(identity, request);
  return project(a, request);
}
/** Read only: compare the accepted mail with every plausible server Sent folder. */
export async function inspectAccreditationSent(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity);
  const { approvalId } = accredApprovalInput.parse(raw);
  const draft = await getAccreditationDraft(identity, { approvalId });
  if (draft.status !== 'accepted' || !draft.receipt?.messageId) throw Error('mcp_accreditation_sent_receipt_missing');
  return inspectSentMessage({ mailbox: 'liv', messageId: draft.receipt.messageId,
    from: 'liv@aproposmagazine.com', to: draft.to, subject: draft.subject, body: draft.body });
}

/** Copy-only repair; a durable claim prevents a second APPEND after an uncertain result. Never SMTP. */
export async function repairAccreditationSent(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity, 'apropos:draft');
  const { approvalId, expectedHash } = accredSentRepairInput.parse(raw);
  const draft = await getAccreditationDraft(identity, { approvalId });
  if (draft.contentHash !== expectedHash) throw Error('mcp_accreditation_draft_changed');
  const expected = { mailbox: 'liv' as const, messageId: draft.receipt?.messageId || '',
    from: 'liv@aproposmagazine.com', to: draft.to, subject: draft.subject, body: draft.body };
  if (draft.status !== 'accepted' || !expected.messageId) throw Error('mcp_accreditation_sent_receipt_missing');
  const before = await inspectSentMessage(expected);
  const target = before.matches.filter(m => m.folder === before.targetFolder);
  if (target.length === 1 && target[0].identityMatches) return { status: 'verified', copied: false, folder: before.targetFolder, smtpCalled: false };
  if (target.length || before.matches.length !== 1 || !before.matches[0].identityMatches)
    throw Error('mcp_accreditation_sent_source_ambiguous');
  const source = before.matches[0], db = requireFirestore();
  const claimRef = db.collection('accreditationMcpSentRepairs').doc(approvalId);
  try {
    await claimRef.create({ ownerUid: identity.uid, contentHash: expectedHash, messageId: expected.messageId,
      sourceFolder: source.folder, sourceSha256: source.sha256, status: 'claimed', createdAt: new Date().toISOString() });
  } catch {
    const prior = (await claimRef.get()).data();
    if (!prior || prior.ownerUid !== identity.uid || prior.contentHash !== expectedHash || prior.messageId !== expected.messageId)
      throw Error('mcp_accreditation_sent_repair_conflict');
    // Another attempt may have completed despite a lost response. Only read back; never append again.
    const current = await inspectSentMessage(expected);
    const matches = current.matches.filter(m => m.folder === current.targetFolder && m.identityMatches && m.sha256 === source.sha256);
    return { status: matches.length === 1 ? 'verified' : 'unconfirmed', copied: prior.status === 'verified',
      folder: current.targetFolder, smtpCalled: false, retryAllowed: false };
  }
  try {
    const result = await copyExistingSentMessage(expected, source);
    await claimRef.update({ status: 'verified', targetFolder: result.folder, targetUid: result.uid,
      copied: result.copied, verifiedAt: new Date().toISOString() });
    return { status: 'verified', copied: result.copied, folder: result.folder, smtpCalled: false };
  } catch {
    const current = await inspectSentMessage(expected).catch(() => null);
    const matches = current?.matches.filter(m => m.folder === current.targetFolder && m.identityMatches && m.sha256 === source.sha256) || [];
    if (matches.length === 1) {
      await claimRef.update({ status: 'verified', targetFolder: current!.targetFolder, verifiedAt: new Date().toISOString() });
      return { status: 'verified', copied: true, folder: current!.targetFolder, smtpCalled: false };
    }
    await claimRef.update({ status: 'unconfirmed', checkedAt: new Date().toISOString() }).catch(() => undefined);
    return { status: 'unconfirmed', copied: null, folder: before.targetFolder, smtpCalled: false, retryAllowed: false };
  }
}
/** Personal channel only; legacy sink/dry-run/allowlist remain unchanged. */
export async function accreditationSendPrecheck(to: string, ownerUid:string) {
  accredEmail.parse(to); await contactCheck(to);
  await assertPersonalAccreditationPolicy(ownerUid);
  // Existing SMTP only. Never introduce a different provider as a repair.
  const smtp = getSmtpPublicConfig();
  if (getAccreditationMailTransport() !== 'smtp' || !smtp.passwordConfigured || smtp.user.toLowerCase() !== 'liv@aproposmagazine.com')
    throw Error('mcp_accreditation_smtp_not_ready');
}
export async function saveAccreditationDraft(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity, 'apropos:draft'); const input = accredDraftInput.parse(raw), db = requireFirestore();
  const op = operationRef(identity.uid, input.operationId);
  // Early idempotent read permits recovery even though saving changed the case hash.
  const replay = (await op.get()).data();
  if (replay) { if (replay.inputHash !== hash(input) || !replay.approvalId) throw Error('mcp_accreditation_operation_conflict'); return getAccreditationDraft(identity, { approvalId: replay.approvalId }); }
  const signature = await currentSignature('liv');
  const prepared = applySignature(sanitizeLivOutput(input.text), signature);
  const request = checkCase(identity, await getRequestById(input.requestId), input.expectedHash);
  if (!request.mcp) throw Error('mcp_accreditation_adopt_case_first');
  const to = accredEmail.parse(input.kind === 'applicant_notice' || input.kind === 'package' ? request.deliveryRecipientEmail : request.contactEmail);
  await contactCheck(to);
  if (request.paused || ['withdrawn', 'closed'].includes(request.status)) throw Error('mcp_accreditation_case_not_active');
  const id = input.approvalId || `mcp-${hash({ uid: identity.uid, operationId: input.operationId }).slice(0, 40)}`;
  const savedId = await db.runTransaction(async tx => {
    const prior = (await tx.get(op)).data();
    if (prior) { if (prior.inputHash !== hash(input)) throw Error('mcp_accreditation_operation_conflict'); return prior.approvalId as string; }
    const row = checkCase(identity, (await tx.get(caseRef(request.id))).data() as AccreditationRequest | undefined, input.expectedHash);
    const aRef = approvalRef(id), existing = (await tx.get(aRef)).data() as ApprovalItem | undefined;
    if (existing) validateDraft(identity, existing);
    if ((existing?.mcp?.revision || 0) !== input.expectedRevision || (input.approvalId && !existing)) throw Error('mcp_accreditation_revision_conflict');
    if (existing && (existing.mcp?.status !== 'draft' || existing.status !== 'queued')) throw Error('mcp_accreditation_already_attempted');
    const approvals = (await tx.get(db.collection(COLLECTIONS.approvals).where('requestId', '==', row.id))).docs.map(d => d.data() as ApprovalItem);
    if (approvals.some(a => a.mcp && ['sending', 'unconfirmed'].includes(a.mcp.status))) throw Error('mcp_accreditation_send_unconfirmed');
    const threadId = row.threadId || `mcp-thread-${row.id}`, tRef = db.collection(COLLECTIONS.emailThreads).doc(threadId);
    const oldThread = (await tx.get(tRef)).data() as AccreditationEmailThread | undefined;
    const pkg = (await tx.get(db.collection(COLLECTIONS.accessPackages).doc(row.id))).data() as AccessPackage | undefined;
    if (oldThread && oldThread.requestId !== row.id) throw Error('mcp_accreditation_thread_mismatch');
    if (input.kind === 'first_outbound' && (oldThread?.messages.some(m => m.direction === 'outbound') || approvals.some(a => ['sent', 'auto_sent', 'approved'].includes(a.status))))
      throw Error('mcp_accreditation_first_outbound_exists');
    if (input.kind === 'follow_up' && ((row.followUpCount || 0) >= 2 || !oldThread?.messages.some(m => m.direction === 'outbound') || !row.nextFollowUpAt || Date.parse(row.nextFollowUpAt) > Date.now()))
      throw Error('mcp_accreditation_follow_up_not_due');
    if (input.kind === 'reply' && !oldThread?.messages.some(m => m.id === input.sourceMessageId && m.direction === 'inbound' && m.from.toLowerCase() === to))
      throw Error('mcp_accreditation_reply_source_required');
    if (['applicant_notice', 'package'].includes(input.kind) && !['granted', 'denied'].includes(row.status)) throw Error('mcp_accreditation_outcome_required');
    if (input.kind !== 'package' && input.assetIds.length) throw Error('mcp_accreditation_attachments_not_allowed');
    const assets = input.assetIds.map(id => pkg?.assets.find(a => a.id === id));
    if (new Set(input.assetIds).size !== input.assetIds.length || assets.some(a => !a?.safe || (a.kind === 'attachment' && (!a.sha256 || !a.storagePath))))
      throw Error('mcp_accreditation_unsafe_asset');
    if (input.kind === 'package' && (row.status !== 'granted' || (!assets.length && !pkg?.guestListInstructions) || row.finalPackageDelivered)) throw Error('mcp_accreditation_package_required');
    if (input.kind === 'package' && (pkg?.assets.some(a => a.safe && !input.assetIds.includes(a.id)) ||
      (pkg?.guestListInstructions && !input.text.includes(pkg.guestListInstructions)))) throw Error('mcp_accreditation_package_incomplete');
    const selected = assets as AccessPackageAsset[];
    if (selected.some(a => a.kind !== 'attachment' && !(input.text.includes(a.url || a.text || '\u0000')))) throw Error('mcp_accreditation_package_text_required');
    const now = new Date().toISOString(), subject = ensureRequestIdInSubject(sanitizeLivOutput(input.subject), row.id), text = prepared.body;
    if (approvals.some(a => a.id !== id && a.mcp?.status === 'accepted' && a.to === to &&
      (a.text === text && a.subject === subject || input.kind === 'reply' && a.mcp.sourceMessageId === input.sourceMessageId)))
      throw Error('mcp_accreditation_already_attempted');
    const thread: AccreditationEmailThread = oldThread || { id: threadId, requestId: row.id, contactEmail: row.contactEmail || to,
      subject, status: 'draft', messages: [], createdAt: now, updatedAt: now };
    const nextCase = { ...row, ...(input.kind === 'first_outbound' ? { status: 'draft_ready' as const } : {}), threadId, pendingApprovalId: id, updatedAt: now, mcp: { ...row.mcp!, revision: row.mcp!.revision + 1 } };
    const draft: ApprovalItem = { id, requestId: row.id, threadId, kind: input.kind === 'package' ? 'applicant_notice' : input.kind,
      to, subject, text, html: prepared.html, draftHash: draftHash(subject, text), policyFlags: detectEscalationHeuristics(text),
      status: 'queued', autoEligible: false, createdAt: existing?.createdAt || now, updatedAt: now,
      mcp: { ownerUid: identity.uid, revision: input.expectedRevision + 1, kind: input.kind, caseHash: accreditationCaseHash(nextCase), contentHash: '',
        contextHash: contextHash(thread, pkg), status: 'draft', from: getAccreditationFromEmail(), replyTo: getAccreditationReplyTo(threadId),
        presentationVersion: 2, signatureHash: signature.hash,
        assets: selected, ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}) } };
    draft.mcp!.contentHash = contentHash(draft);
    for (const a of approvals) if (a.id !== id && ['queued', 'approved'].includes(a.status)) tx.update(approvalRef(a.id), { status: 'superseded', updatedAt: now });
    if (!oldThread) tx.create(tRef, thread);
    if (existing) tx.create(db.collection('accreditationMcpDraftVersions').doc(`${id}-${existing.mcp!.revision}`), stripUndefined(existing));
    tx.set(caseRef(row.id), stripUndefined(nextCase)); tx.set(aRef, stripUndefined(draft));
    tx.create(op, { inputHash: hash(input), approvalId: id, requestId: row.id, createdAt: now }); recordCaseAudit(tx, op.id, row.id, 'mcp_draft_saved');
    return id;
  });
  return getAccreditationDraft(identity, { approvalId: savedId });
}
export async function previewAccreditationDraft(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity); const { approvalId } = accredApprovalInput.parse(raw), data = await getAccreditationDraft(identity, { approvalId });
  const a = validateDraft(identity, await getApprovalById(approvalId));
  let blocker: string | null = null, confirmation: { token: string; expiresAt: number } | null = null;
  if (a.mcp.status === 'draft') {
    try {
      if (!identity.scopes.includes('apropos:publish') || !identity.scopes.includes('apropos:draft')) throw Error('mcp_accreditation_send_scope_required');
      if (a.mcp.presentationVersion !== 2 || a.mcp.signatureHash !== (await currentSignature('liv')).hash)
        throw Error('mcp_accreditation_signature_update_required');
      if (a.status !== 'queued' || data.caseHash !== a.mcp.caseHash) throw Error('mcp_accreditation_case_changed');
      const [threads, pkg] = await Promise.all([getThreadsByRequestId(a.requestId), getAccessPackage(a.requestId)]);
      if (contextHash(threads.find(t => t.id === a.threadId), pkg) !== a.mcp.contextHash) throw Error('mcp_accreditation_context_changed');
      await accreditationSendPrecheck(a.to,a.mcp.ownerUid);
      if (getAccreditationFromEmail() !== a.mcp.from || getAccreditationReplyTo(a.threadId!) !== a.mcp.replyTo) throw Error('mcp_accreditation_sender_changed');
      const token = opaque(), expiresAt = Date.now() + 600000;
      await requireFirestore().collection('accreditationMcpConfirmations').doc(digest(token)).create({ uid: identity.uid, grantId: identity.grantId,
        approvalId, revision: a.mcp.revision, contentHash: a.mcp.contentHash, status: 'pending', expiresAt });
      confirmation = { token, expiresAt };
    } catch (e) { blocker = e instanceof Error && /^mcp_accreditation_[a-z_]+$/.test(e.message) ? e.message : 'mcp_accreditation_precheck_failed'; }
  }
  return { data: { ...data, blocker, previewReadAt: new Date().toISOString() }, confirmation };
}
async function attachmentBytes(assets: AccessPackageAsset[]) {
  const result: Array<{ filename: string; content: string; contentType: string }> = []; let size = 0;
  for (const a of assets.filter(a => a.kind === 'attachment')) {
    if (!a.safe || !a.storagePath || !a.sha256) throw Error('mcp_accreditation_unsafe_asset');
    const bytes = await readStoredAttachment(a.storagePath);
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== a.sha256 || bytes.length !== a.sizeBytes) throw Error('mcp_accreditation_asset_changed');
    size += bytes.length; if (size > 12 * 1024 * 1024) throw Error('mcp_accreditation_package_too_large');
    const check = validateAttachmentSafety({ filename: a.filename || '', contentType: a.contentType, sizeBytes: bytes.length, buffer: bytes });
    if (!check.safe) throw Error('mcp_accreditation_unsafe_asset');
    result.push({ filename: a.filename!, content: bytes.toString('base64'), contentType: check.contentType });
  }
  return result;
}
/** UI-only. A permanent durable claim precedes SMTP; no lease expiry or timeout can resend. */
export async function confirmAccreditationDraft(identity: McpIdentity, raw: unknown) {
  assertMailOwner(identity, 'apropos:publish'); assertMailOwner(identity, 'apropos:draft');
  const input = accredConfirmInput.parse(raw), db = requireFirestore(), cRef = db.collection('accreditationMcpConfirmations').doc(digest(input.token));
  const c = (await cRef.get()).data();
  if (!c || c.uid !== identity.uid || c.grantId !== identity.grantId || c.contentHash !== input.displayedHash) throw Error('mcp_accreditation_confirmation_required');
  const before = validateDraft(identity, await getApprovalById(c.approvalId));
  if (before.mcp.status !== 'draft') return getAccreditationDraft(identity, { approvalId: before.id });
  if (before.mcp.presentationVersion !== 2 || before.mcp.signatureHash !== (await currentSignature('liv')).hash)
    throw Error('mcp_accreditation_signature_update_required');
  await accreditationSendPrecheck(before.to,before.mcp.ownerUid);
  const attachments = await attachmentBytes(before.mcp.assets);
  const claim = await db.runTransaction(async tx => {
    const consent = (await tx.get(cRef)).data();
    if (!consent || consent.uid !== identity.uid || consent.grantId !== identity.grantId || consent.contentHash !== input.displayedHash) throw Error('mcp_accreditation_confirmation_required');
    const a = validateDraft(identity, (await tx.get(approvalRef(consent.approvalId))).data() as ApprovalItem | undefined);
    if (a.mcp.status !== 'draft') return { send: false, approval: a };
    if (consent.status !== 'pending' || consent.expiresAt <= Date.now()) throw Error('mcp_accreditation_confirmation_expired');
    if (a.mcp.contentHash !== consent.contentHash || a.mcp.revision !== consent.revision || a.status !== 'queued') throw Error('mcp_accreditation_draft_changed');
    const row = checkCase(identity, (await tx.get(caseRef(a.requestId))).data() as AccreditationRequest | undefined, a.mcp.caseHash);
    if (!row.mcp || row.pendingApprovalId !== a.id || row.paused) throw Error('mcp_accreditation_case_changed');
    const thread = (await tx.get(db.collection(COLLECTIONS.emailThreads).doc(a.threadId!))).data() as AccreditationEmailThread | undefined;
    const pkg = (await tx.get(db.collection(COLLECTIONS.accessPackages).doc(a.requestId))).data() as AccessPackage | undefined;
    if (contextHash(thread, pkg) !== a.mcp.contextHash) throw Error('mcp_accreditation_context_changed');
    if (getAccreditationFromEmail() !== a.mcp.from || getAccreditationReplyTo(a.threadId!) !== a.mcp.replyTo) throw Error('mcp_accreditation_sender_changed');
    const now = new Date().toISOString(), mcp = { ...a.mcp, status: 'sending' as const, attemptedAt: now, attemptId: digest(input.token) };
    tx.update(cRef, { status: 'consumed', consumedAt: now }); tx.update(approvalRef(a.id), { mcp, approvedAt: now, updatedAt: now });
    return { send: true, approval: { ...a, mcp } };
  });
  if (!claim.send) return getAccreditationDraft(identity, { approvalId: claim.approval.id });
  const a = claim.approval;
  try {
    const receipt = await sendAccreditationEmail({ to: a.to, subject: a.subject, text: a.text,
      html: a.html || accreditationMailHtml(a.text),
      threadId: a.threadId!, requestId: a.requestId, draftHash: a.draftHash, attachments,
      personalApproval: { approvalId: a.id, attemptId: a.mcp.attemptId! } });
    if (!receipt.ok) throw Error('mcp_accreditation_transport_unconfirmed');
    const now = new Date().toISOString();
    // Persist transport acceptance before any derived bookkeeping.
    const nextMcp = { ...a.mcp, status: 'accepted' as const, receipt: stripUndefined({ acceptedByMailServer: true,
      recipientDeliveryVerified: false as const, messageId: receipt.messageId, resendEmailId: receipt.resendEmailId,
      sentCopyArchived: !!receipt.sentCopyArchived, acceptedAt: now }) };
    await approvalRef(a.id).update({ mcp: nextMcp, status: 'sent', sentAt: now, updatedAt: now });
    await db.runTransaction(async tx => {
      const rRef = caseRef(a.requestId), tRef = db.collection(COLLECTIONS.emailThreads).doc(a.threadId!);
      const row = (await tx.get(rRef)).data() as AccreditationRequest;
      const thread = (await tx.get(tRef)).data() as AccreditationEmailThread;
      const pkgRef = db.collection(COLLECTIONS.accessPackages).doc(a.requestId), pkg = (await tx.get(pkgRef)).data() as AccessPackage | undefined;
      const sameVersion = accreditationCaseHash(row) === a.mcp.caseHash;
      if (!sameVersion) tx.update(approvalRef(a.id), { mcp: { ...nextMcp, syncWarning: 'Mail accepted; newer case state preserved. Read back before continuing. Never resend.' } });
      tx.set(tRef, stripUndefined({ ...thread, updatedAt: now, status: a.mcp.kind === 'package' || a.mcp.kind === 'applicant_notice' ? thread.status : 'awaiting_reply',
        messages: [...thread.messages, { id: `out-${a.id}`, direction: 'outbound', from: a.mcp.from, to: a.to, subject: a.subject,
          text: a.text, sentAt: now, messageId: receipt.messageId, resendEmailId: receipt.resendEmailId, deliveryStatus: 'sent' }] }));
      if (sameVersion) tx.set(rRef, stripUndefined({ ...row, updatedAt: now,
        ...(['first_outbound', 'follow_up', 'reply'].includes(a.mcp.kind) ? { status: 'sent_awaiting_reply', nextFollowUpAt: new Date(Date.now() + 3 * 86400000).toISOString(),
          followUpCount: (row.followUpCount || 0) + (a.mcp.kind === 'follow_up' ? 1 : 0) } : {}),
        ...(a.mcp.kind === 'package' ? { finalDeliveryStatus: 'delivered', finalPackageDelivered: true } : {}) }));
      if (a.mcp.kind === 'package' && pkg && sameVersion) tx.set(pkgRef, stripUndefined({ ...pkg, deliveryStatus: 'delivered', deliveredAt: now, deliveredTo: a.to, updatedAt: now }));
      recordCaseAudit(tx, `sent-${a.id}-${a.mcp.revision}`, a.requestId, 'mcp_personally_approved_send');
    }).catch(async () => { await approvalRef(a.id).update({ mcp: { ...nextMcp, syncWarning: 'Mail accepted; case/thread bookkeeping needs readback. Never resend.' } }); });
  } catch {
    // Even a transport error can follow SMTP acceptance. Keep the attempt, never retry.
    const current = (await approvalRef(a.id).get()).data() as ApprovalItem | undefined;
    if (current?.mcp?.status !== 'accepted') await approvalRef(a.id).update({ mcp: { ...a.mcp, status: 'unconfirmed' }, updatedAt: new Date().toISOString() }).catch(() => undefined);
  }
  return getAccreditationDraft(identity, { approvalId: a.id });
}
