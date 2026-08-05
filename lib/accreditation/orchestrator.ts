import { isDryRun, isAutomationEnabled } from '@/lib/accreditation/agent-control';
import { isAccreditationTestRedirectActive } from '@/lib/accreditation/outbound-safety';
import { enqueueApproval, setApprovalStatus } from '@/lib/accreditation/approval-store';
import { appendAudit } from '@/lib/accreditation/audit-store';
import {
  buildAccreditationDraft,
  buildApplicantNotice,
  buildFollowUpDraft,
  buildInternalAckDraft,
  draftHash,
  textToEmailHtml,
} from '@/lib/accreditation/draft-template';
import {
  appendOutboundMessage,
  createEmailThread,
  getThreadById,
  updateThreadStatus,
} from '@/lib/accreditation/email-thread-store';
import {
  buildPolicyFlags,
  canAutoSend,
  computeAutoEligible,
  detectEscalationHeuristics,
} from '@/lib/accreditation/policy';
import { researchAccreditationContact } from '@/lib/accreditation/research';
import { createRequest, getRequestById, updateRequest } from '@/lib/accreditation/request-store';
import {
  getAccreditationFromEmail,
  sendAccreditationEmail,
} from '@/lib/accreditation/send-email';
import { ensureRequestIdInSubject, sanitizeLivOutput } from '@/lib/accreditation/sanitize';
import { loadMemoryForReply, updateMemoryAfterEvent } from '@/lib/accreditation/memory-store';
import {
  releaseSendLock,
  tryClaimSendLock,
} from '@/lib/accreditation/persistence/leases';
import { syncRequestToSheet } from '@/lib/accreditation/sheet-client';
import type {
  AccreditationRequest,
  ApprovalItem,
  ApprovalKind,
  ApprovalPolicyFlag,
  ExtractedConcertRequest,
} from '@/lib/accreditation/types';

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function maybeSyncSheet(
  request: AccreditationRequest,
  extras: { lastAction: string; nextFollowUp?: string; emailThreadSource?: string }
) {
  try {
    const sheet = await syncRequestToSheet(request, extras);
    if (sheet.rowNumber) await updateRequest(request.id, { sheetRowNumber: sheet.rowNumber });
  } catch (e) {
    await appendAudit({
      requestId: request.id,
      type: 'sheet_sync_error',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function dispatchOutbound(params: {
  request: AccreditationRequest;
  kind: ApprovalKind;
  to: string;
  subject: string;
  text: string;
  threadId?: string;
  contactName?: string;
  extraFlags?: ApprovalPolicyFlag[];
  forceEscalate?: boolean;
  /** Manual send from UI — allowed even when global automation is OFF. */
  forceManual?: boolean;
}): Promise<{
  sent: boolean;
  approval: ApprovalItem;
  dryRun?: boolean;
  escalated?: boolean;
  queuedOnly?: boolean;
  alreadySent?: boolean;
}> {
  // Per-request pause: queue draft, never auto-send
  if (params.request.paused && !params.forceManual) {
    const flags = buildPolicyFlags({ kind: params.kind, ambiguous: true });
    const approval = await enqueueApproval({
      requestId: params.request.id,
      threadId: params.threadId,
      kind: params.kind,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: textToEmailHtml(params.text),
      draftHash: draftHash(params.subject, params.text),
      policyFlags: flags,
    });
    await updateRequest(params.request.id, {
      status: 'paused',
      pendingApprovalId: approval.id,
    });
    return { sent: false, approval, queuedOnly: true };
  }

  const heuristicFlags = detectEscalationHeuristics(params.text);
  const flags = Array.from(
    new Set([
      ...buildPolicyFlags({
        kind: params.kind,
        contactConfidence: params.request.contactConfidence,
        ambiguous: params.forceEscalate || params.request.contactConfidence === 'low',
        routineFollowUp: params.kind === 'follow_up',
      }),
      ...heuristicFlags,
      ...(params.extraFlags || []),
    ])
  );

  const approval = await enqueueApproval({
    requestId: params.request.id,
    threadId: params.threadId,
    kind: params.kind,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: textToEmailHtml(params.text),
    draftHash: draftHash(params.subject, params.text),
    policyFlags: flags,
  });

  const { readApprovals, writeApprovals } = await import('@/lib/accreditation/approval-store');
  const all = await readApprovals();
  const idx = all.findIndex((a) => a.id === approval.id);
  const automationOn = await isAutomationEnabled();
  const autoEligible =
    computeAutoEligible(flags) && !params.forceEscalate && automationOn;
  if (idx >= 0) {
    all[idx] = { ...all[idx], autoEligible };
    await writeApprovals(all);
  }
  const item = { ...approval, autoEligible };

  const forceManual = Boolean(params.forceManual || isAccreditationTestRedirectActive());

  // Global automation OFF: keep draft queued for manual send; do not Resend
  // Exception: test redirect sink — send the draft only to the allowlisted test inbox.
  if (!forceManual && !(await isAutomationEnabled())) {
    await updateRequest(params.request.id, {
      status: 'draft_ready',
      pendingApprovalId: item.id,
    });
    await appendAudit({
      requestId: params.request.id,
      type: 'automation_off_queue',
      detail: 'Automation OFF — draft queued, no auto-send',
      meta: { approvalId: item.id, kind: params.kind },
    });
    return { sent: false, approval: item, queuedOnly: true };
  }

  if (!forceManual && !canAutoSend(item)) {
    await updateRequest(params.request.id, {
      status: 'escalated',
      pendingApprovalId: item.id,
    });
    await appendAudit({
      requestId: params.request.id,
      type: 'escalate',
      detail: `Escaleret: ${flags.join(', ')}`,
      meta: { approvalId: item.id },
    });
    return { sent: false, approval: item, escalated: true };
  }

  // Manual / test-redirect path: mark approved so send gate passes
  if (forceManual) {
    await setApprovalStatus(item.id, 'approved');
  }

  const subject = ensureRequestIdInSubject(
    sanitizeLivOutput(params.subject),
    params.request.id
  );
  const text = sanitizeLivOutput(params.text);

  let threadId = params.threadId || params.request.threadId;
  let thread = threadId ? await getThreadById(threadId) : undefined;
  if (!thread) {
    thread = await createEmailThread({
      requestId: params.request.id,
      contactEmail: params.to.split(',')[0].trim(),
      contactName: params.contactName || params.request.contactName,
      subject,
    });
    threadId = thread.id;
  }

  if (await isDryRun()) {
    await setApprovalStatus(item.id, 'auto_sent');
    await appendOutboundMessage(threadId!, {
      from: getAccreditationFromEmail(),
      to: params.to,
      subject,
      text: `[DRY-RUN] ${text}`,
      html: textToEmailHtml(text),
      sentAt: new Date().toISOString(),
      resendEmailId: `dry-run-${item.draftHash}`,
      messageId: `dry-run-${item.draftHash}`,
      deliveryStatus: 'sent',
    });
    await updateRequest(params.request.id, {
      status: params.kind === 'applicant_notice' ? 'closed' : 'sent_awaiting_reply',
      threadId,
      pendingApprovalId: undefined,
      nextFollowUpAt: params.kind === 'applicant_notice' ? undefined : daysFromNow(3),
      followUpCount: params.request.followUpCount || 0,
    });
    await updateMemoryAfterEvent({
      requestId: params.request.id,
      threadId,
      contactEmail: params.to.split(',')[0].trim(),
      contactName: params.contactName || params.request.contactName,
      direction: 'outbound',
      blurb: `${params.kind}: ${subject}`.slice(0, 200),
      subject,
    });
    await appendAudit({
      requestId: params.request.id,
      type: 'dry_run_send',
      detail: `Dry-run send til ${params.to}`,
      meta: { kind: params.kind, approvalId: item.id },
    });
    return { sent: true, approval: item, dryRun: true };
  }

  const lockKey = `send:${item.id}:${item.draftHash}`;
  const { claimed } = await tryClaimSendLock({
    lockKey,
    meta: { requestId: params.request.id, kind: params.kind },
  });
  if (!claimed) {
    return { sent: true, approval: item, alreadySent: true };
  }

  const sendResult = await sendAccreditationEmail({
    to: params.to,
    subject,
    html: textToEmailHtml(text),
    text,
    threadId: threadId!,
    requestId: params.request.id,
    draftHash: item.draftHash,
  });

  if (!sendResult.ok) {
    await releaseSendLock(lockKey);
    await updateRequest(params.request.id, {
      status: 'escalated',
      pendingApprovalId: item.id,
      notes: sendResult.error,
    });
    await appendAudit({
      requestId: params.request.id,
      type: 'send_error',
      detail: sendResult.error || 'send failed',
    });
    return { sent: false, approval: item, escalated: true };
  }

  await appendOutboundMessage(threadId!, {
    from: getAccreditationFromEmail(),
    to: params.to,
    subject: sendResult.subject || subject,
    text,
    html: textToEmailHtml(text),
    sentAt: new Date().toISOString(),
    resendEmailId: sendResult.resendEmailId,
    messageId: sendResult.messageId || sendResult.resendEmailId,
    deliveryStatus: 'sent',
  });
  await updateMemoryAfterEvent({
    requestId: params.request.id,
    threadId,
    contactEmail: params.to.split(',')[0].trim(),
    contactName: params.contactName || params.request.contactName,
    direction: 'outbound',
    blurb: `${params.kind}: ${sendResult.subject || subject}`.slice(0, 200),
    subject: sendResult.subject || subject,
  });
  await setApprovalStatus(item.id, params.forceManual ? 'sent' : 'auto_sent');

  const updated =
    (await updateRequest(params.request.id, {
      status: params.kind === 'applicant_notice' ? 'closed' : 'sent_awaiting_reply',
      threadId,
      pendingApprovalId: undefined,
      nextFollowUpAt: params.kind === 'applicant_notice' ? undefined : daysFromNow(3),
      followUpCount:
        params.kind === 'follow_up'
          ? (params.request.followUpCount || 0) + 1
          : params.request.followUpCount || 0,
    })) || params.request;

  await maybeSyncSheet(updated, {
    lastAction: params.forceManual ? `Manuel send ${params.kind}` : `Auto-send ${params.kind}`,
    nextFollowUp: params.kind === 'applicant_notice' ? '' : 'Auto follow-up +3d',
    emailThreadSource: threadId,
  });

  await appendAudit({
    requestId: params.request.id,
    type: params.forceManual ? 'manual_send' : 'auto_send',
    detail: `Sendt til ${params.to}`,
    meta: {
      kind: params.kind,
      resendEmailId: sendResult.resendEmailId || null,
      approvalId: item.id,
      replyTo: sendResult.replyTo || null,
      sentCopyArchived: sendResult.sentCopyArchived ?? null,
      sentCopyMailbox: sendResult.sentCopyMailbox || null,
      sentCopyError: sendResult.sentCopyError || null,
    },
  });

  return { sent: true, approval: item };
}

/** Create requests from intake concerts and run research + first outreach. */
export async function processInternalIntake(params: {
  concerts: ExtractedConcertRequest[];
  fromEmail: string;
  fromName?: string;
  subject: string;
  sourceEmailId?: string;
  forceEscalate?: boolean;
  extraFlags?: ApprovalPolicyFlag[];
}): Promise<{ requestIds: string[] }> {
  const ids: string[] = [];
  for (const concert of params.concerts) {
    const created = await createRequest({
      artist: concert.artist,
      venue: concert.venue,
      eventDate: concert.eventDate,
      applicants: [
        {
          name: concert.writerName || params.fromName || params.fromEmail,
          email: concert.writerEmail || params.fromEmail,
        },
      ],
      accessRequested: concert.accessRequested,
      notes: `Intake: ${params.subject}`,
    });
    await updateRequest(created.id, {
      ticketType: concert.ticketType,
      ticketQuantity: concert.ticketQuantity,
      promisedCoverage: concert.promisedCoverage,
      sourceIntakeEmailId: params.sourceEmailId,
      sourceIntakeSubject: params.subject,
      deliveryRecipientName: concert.writerName || params.fromName,
      deliveryRecipientEmail: concert.writerEmail || params.fromEmail,
    });
    ids.push(created.id);
    await appendAudit({
      requestId: created.id,
      type: 'intake_email',
      detail: `Intern anmodning fra ${params.fromEmail}: ${concert.artist}`,
    });
    await runAutonomousPipeline(created.id, {
      forceEscalate: params.forceEscalate,
      extraFlags: params.extraFlags,
    });
  }

  if (ids.length) {
    await sendInternalAcknowledgement({
      toEmail: params.fromEmail,
      toName: params.fromName,
      artists: params.concerts.map((c) => c.artist).filter(Boolean),
      requestIds: ids,
    });
  }

  return { requestIds: ids };
}

/**
 * Natural colleague acknowledgement after a valid internal intake.
 * Sends only when automation ON (and not dry-run). Otherwise audit-only.
 */
export async function sendInternalAcknowledgement(params: {
  toEmail: string;
  toName?: string;
  artists: string[];
  requestIds: string[];
}): Promise<{ sent: boolean; detail: string }> {
  if (!params.toEmail.includes('@')) {
    return { sent: false, detail: 'missing recipient' };
  }
  if (!(await isAutomationEnabled())) {
    await appendAudit({
      requestId: params.requestIds[0],
      type: 'internal_ack_skipped',
      detail: 'Automation OFF — acknowledgement drafted conceptually, not sent',
      meta: { to: params.toEmail },
    });
    return { sent: false, detail: 'automation off' };
  }

  const draft = buildInternalAckDraft({
    toName: params.toName,
    artists: params.artists,
    requestIds: params.requestIds,
  });

  if (await isDryRun()) {
    await appendAudit({
      requestId: params.requestIds[0],
      type: 'internal_ack_dry_run',
      detail: `Dry-run ack → ${params.toEmail}`,
    });
    return { sent: true, detail: 'dry-run' };
  }

  const threadId = `ack-${params.requestIds[0] || Date.now()}`;
  const result = await sendAccreditationEmail({
    to: params.toEmail,
    subject: draft.subject,
    html: textToEmailHtml(draft.text),
    text: draft.text,
    threadId,
    requestId: params.requestIds[0] || 'LIV-ACK',
  });

  await appendAudit({
    requestId: params.requestIds[0],
    type: result.ok ? 'internal_ack' : 'internal_ack_failed',
    detail: result.ok
      ? `Acknowledgement sendt til ${params.toEmail}`
      : result.error || 'ack failed',
    meta: { resendEmailId: result.resendEmailId || null },
  });

  return { sent: Boolean(result.ok), detail: result.ok ? 'sent' : result.error || 'failed' };
}

/** Helpful routing reply for unrelated liv@ mail. */
export async function sendRoutingReply(params: {
  toEmail: string;
  toName?: string;
  subject: string;
}): Promise<{ sent: boolean; detail: string }> {
  await appendAudit({
    type: 'routing_reply_disabled',
    detail: `Generic routing reply blocked for ${params.toEmail}`,
    meta: { subject: params.subject.slice(0, 200) },
  });
  return { sent: false, detail: 'generic routing replies are disabled' };
}

export async function runAutonomousPipeline(
  requestId: string,
  opts?: { forceEscalate?: boolean; extraFlags?: ApprovalPolicyFlag[] }
): Promise<{ ok: boolean; detail: string }> {
  const item = await getRequestById(requestId);
  if (!item) return { ok: false, detail: 'not found' };
  if (item.paused) {
    await updateRequest(requestId, { status: 'paused' });
    return { ok: false, detail: 'request paused' };
  }

  await updateRequest(requestId, { status: 'researching' });
  const research = await researchAccreditationContact((await getRequestById(requestId))!);
  const nextStatus =
    research.ambiguous || research.contactConfidence === 'low' ? 'needs_contact' : 'draft_ready';

  const updated = await updateRequest(requestId, {
    status: nextStatus,
    contactName: research.contactName || item.contactName,
    contactEmail: research.contactEmail || item.contactEmail,
    promoter: research.promoter || item.promoter,
    contactConfidence: research.contactConfidence,
    previousCoverageUrl: research.previousCoverageUrl || item.previousCoverageUrl,
    researchNotes: [research.notes, research.memoryBlock]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 4000),
  });

  await appendAudit({
    requestId,
    type: 'research',
    detail: `Research → ${nextStatus} (${research.contactConfidence})`,
    meta: { memoryLoaded: Boolean(research.memoryBlock) },
  });

  const req = updated || (await getRequestById(requestId))!;
  // Ensure memory is loaded before first outreach decision / draft
  await loadMemoryForReply({
    requestId: req.id,
    contactEmail: req.contactEmail,
  }).catch(() => '');

  if (!req.contactEmail || research.contactConfidence === 'low' || research.ambiguous) {
    await updateRequest(requestId, { status: 'escalated' });
    // Still draft for human override queue
    const draft = buildAccreditationDraft({ request: req });
    await dispatchOutbound({
      request: req,
      kind: 'first_outbound',
      to: req.contactEmail || 'unknown@invalid.local',
      subject: draft.subject,
      text: draft.text,
      forceEscalate: true,
      extraFlags: ['lowConfidence', ...(opts?.extraFlags || [])],
    });
    await maybeSyncSheet(req, { lastAction: 'Escaleret — mangler sikker kontakt' });
    return { ok: false, detail: 'escalated: low confidence contact' };
  }

  const draft = buildAccreditationDraft({ request: req });
  const result = await dispatchOutbound({
    request: req,
    kind: 'first_outbound',
    to: req.contactEmail,
    subject: draft.subject,
    text: draft.text,
    contactName: req.contactName,
    forceEscalate: opts?.forceEscalate,
    extraFlags: opts?.extraFlags,
  });

  return {
    ok: result.sent,
    detail: result.escalated ? 'escalated' : result.dryRun ? 'dry-run' : 'sent',
  };
}

export async function autoReplyToExternal(params: {
  request: AccreditationRequest;
  threadId: string;
  to: string;
  subject: string;
  suggestedReply: string;
  novelQuestion?: boolean;
  inboundText: string;
  attachments?: Array<{ filename: string; contentType?: string; contentBase64?: string; buffer?: Buffer }>;
}): Promise<void> {
  const extra = detectEscalationHeuristics(params.inboundText);
  const outcomeGranted = /godkend|bekræft|velkommen|accredited|you.?re in|adgang/i.test(
    params.inboundText
  );
  const outcomeDenied = /desværre|afvist|cannot|ikke muligt|udsolgt|no tickets/i.test(
    params.inboundText
  );

  const { ingestInboundAccessMaterials, deliverFinalAccessPackage } = await import(
    '@/lib/accreditation/access-package'
  );
  const materials = await ingestInboundAccessMaterials({
    requestId: params.request.id,
    text: params.inboundText,
    attachments: params.attachments,
  });

  if (outcomeGranted || outcomeDenied) {
    const outcome = outcomeGranted ? 'granted' : 'denied';
    await updateRequest(params.request.id, {
      status: outcome,
      outcomeReason: outcome === 'granted'
        ? materials.hasPackage
          ? 'Positivt svar + adgangspakke'
          : 'Positivt svar (afventer billetter/adgang)'
        : 'Afvist',
      finalDeliveryStatus: materials.hasPackage ? 'package_ready' : outcome === 'granted' ? 'approval_only' : 'none',
      finalPackageDelivered: false,
    });
    for (const t of [params.threadId]) await updateThreadStatus(t, 'closed');

    if (outcome === 'granted' && materials.hasPackage) {
      await deliverFinalAccessPackage({ requestId: params.request.id });
    } else {
      await notifyApplicant(params.request.id, outcome, undefined, {
        approvalOnly: outcome === 'granted' && !materials.hasPackage,
      });
    }
    return;
  }

  // Package without explicit grant wording — still deliver if materials look complete
  if (materials.hasPackage) {
    await updateRequest(params.request.id, {
      status: 'granted',
      outcomeReason: 'Adgangsmateriale modtaget',
      finalDeliveryStatus: 'package_ready',
    });
    await deliverFinalAccessPackage({ requestId: params.request.id });
    return;
  }

  await dispatchOutbound({
    request: (await getRequestById(params.request.id)) || params.request,
    kind: 'reply',
    to: params.to,
    subject: params.subject,
    text: params.suggestedReply,
    threadId: params.threadId,
    extraFlags: [
      ...extra,
      ...(params.novelQuestion ? (['novelQuestion'] as ApprovalPolicyFlag[]) : []),
    ],
    forceEscalate: extra.length > 0,
  });
}

export async function notifyApplicant(
  requestId: string,
  outcome: 'granted' | 'denied' | 'update',
  detail?: string,
  opts?: { approvalOnly?: boolean }
): Promise<void> {
  const req = await getRequestById(requestId);
  if (!req) return;
  const to =
    req.deliveryRecipientEmail ||
    req.applicants.map((a) => a.email).filter(Boolean).join(', ');
  if (!to) {
    await updateRequest(requestId, {
      status: 'escalated',
      notes: 'Mangler ansøger-email til notifikation',
    });
    return;
  }
  await updateRequest(requestId, { status: 'notifying_applicants' });
  const draft = buildApplicantNotice({
    request: req,
    outcome,
    detail,
    approvalOnly: opts?.approvalOnly,
  });
  await dispatchOutbound({
    request: (await getRequestById(requestId)) || req,
    kind: 'applicant_notice',
    to,
    subject: draft.subject,
    text: draft.text,
  });
  await maybeSyncSheet((await getRequestById(requestId)) || req, {
    lastAction: opts?.approvalOnly
      ? `Godkendt — afventer adgangspakke (${outcome})`
      : `Ansøger notificeret (${outcome})`,
    nextFollowUp: '',
  });
}

export async function sendDueFollowUps(): Promise<{ sent: number; skipped: number }> {
  const { readRequests } = await import('@/lib/accreditation/request-store');
  if (!(await isAutomationEnabled())) {
    return { sent: 0, skipped: 0 };
  }
  const now = Date.now();
  let sent = 0;
  let skipped = 0;
  for (const req of await readRequests()) {
    if (req.paused || req.status === 'paused') {
      skipped++;
      continue;
    }
    if (req.status !== 'sent_awaiting_reply') continue;
    if (!req.nextFollowUpAt || Date.parse(req.nextFollowUpAt) > now) continue;
    if ((req.followUpCount || 0) >= 2) {
      await updateRequest(req.id, { status: 'stalled' });
      skipped++;
      continue;
    }
    if (!req.contactEmail) {
      skipped++;
      continue;
    }
    await loadMemoryForReply({
      requestId: req.id,
      contactEmail: req.contactEmail,
    }).catch(() => '');
    const draft = buildFollowUpDraft({ request: req });
    const result = await dispatchOutbound({
      request: req,
      kind: 'follow_up',
      to: req.contactEmail,
      subject: draft.subject,
      text: draft.text,
      threadId: req.threadId,
      contactName: req.contactName,
    });
    if (result.sent) sent++;
    else skipped++;
  }
  return { sent, skipped };
}
