import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getApprovalById, setApprovalStatus } from '@/lib/accreditation/approval-store';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { textToEmailHtml } from '@/lib/accreditation/draft-template';
import {
  appendOutboundMessage,
  createEmailThread,
  getThreadById,
  updateThreadContact,
} from '@/lib/accreditation/email-thread-store';
import { assertSendAllowed } from '@/lib/accreditation/policy';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';
import {
  getAccreditationFromEmail,
  sendAccreditationEmail,
} from '@/lib/accreditation/send-email';
import { syncRequestToSheet } from '@/lib/accreditation/sheet-client';
import {
  releaseSendLock,
  tryClaimSendLock,
} from '@/lib/accreditation/persistence/leases';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const approvalId = String(body.approvalId || '').trim();
    const approval = await getApprovalById(approvalId);
    if (!approval) {
      return NextResponse.json(
        createErrorResponse('Approval not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    try {
      assertSendAllowed(approval);
    } catch (e) {
      return NextResponse.json(
        createErrorResponse(e instanceof Error ? e.message : 'Escalation required', {
          statusCode: 403,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 403 }
      );
    }

    if (approval.draftHash && body.draftHash && body.draftHash !== approval.draftHash) {
      return NextResponse.json(
        createErrorResponse('draftHash matcher ikke — godkend igen efter redigering', {
          statusCode: 409,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 409 }
      );
    }

    const accredRequest = await getRequestById(approval.requestId);
    if (!accredRequest) {
      return NextResponse.json(
        createErrorResponse('Request not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    if (!getAccreditationFromEmail().includes('@')) {
      return NextResponse.json(
        createErrorResponse('ACCREDITATION_FROM_EMAIL er ikke konfigureret', {
          statusCode: 503,
          errorCode: ErrorCode.INTERNAL_ERROR,
          requestId,
        }),
        { status: 503 }
      );
    }

    const lockKey = `send:${approval.id}:${approval.draftHash}`;
    const { claimed } = await tryClaimSendLock({
      lockKey,
      meta: { requestId: accredRequest.id, approvalId },
    });
    if (!claimed) {
      return NextResponse.json(
        createSuccessResponse(
          {
            alreadySent: true,
            threadId: approval.threadId || accredRequest.threadId,
            request: await getRequestById(accredRequest.id),
          },
          { requestId }
        )
      );
    }

    let threadId = approval.threadId || accredRequest.threadId;
    let thread = threadId ? await getThreadById(threadId) : undefined;
    if (!thread) {
      thread = await createEmailThread({
        requestId: accredRequest.id,
        contactEmail: approval.to.split(',')[0].trim(),
        contactName: accredRequest.contactName,
        subject: approval.subject,
      });
      threadId = thread.id;
    } else if (
      thread.contactEmail.trim().toLowerCase() !==
      approval.to.split(',')[0].trim().toLowerCase()
    ) {
      thread = await updateThreadContact(
        thread.id,
        approval.to.split(',')[0].trim(),
        accredRequest.contactName
      );
    }

    const html = approval.html || textToEmailHtml(approval.text);
    const sendResult = await sendAccreditationEmail({
      to: approval.to,
      subject: approval.subject,
      html,
      text: approval.text,
      threadId: threadId!,
      requestId: accredRequest.id,
      draftHash: approval.draftHash,
    });

    if (!sendResult.ok) {
      await releaseSendLock(lockKey);
      return NextResponse.json(
        createErrorResponse(sendResult.error || 'Send failed', {
          statusCode: 502,
          errorCode: ErrorCode.INTERNAL_ERROR,
          requestId,
        }),
        { status: 502 }
      );
    }

    await appendOutboundMessage(threadId!, {
      from: getAccreditationFromEmail(),
      to: approval.to,
      subject: approval.subject,
      text: approval.text,
      html,
      sentAt: new Date().toISOString(),
      resendEmailId: sendResult.resendEmailId,
      messageId: sendResult.messageId || sendResult.resendEmailId,
      deliveryStatus: 'sent',
    });

    await setApprovalStatus(approvalId, 'sent');

    const nextStatus =
      approval.kind === 'applicant_notice'
        ? 'closed'
        : approval.kind === 'reply'
          ? 'sent_awaiting_reply'
          : 'sent_awaiting_reply';

    const updated = await updateRequest(accredRequest.id, {
      status: nextStatus === 'closed' ? 'closed' : 'sent_awaiting_reply',
      threadId,
      pendingApprovalId: undefined,
      nextFollowUpAt:
        approval.kind === 'applicant_notice'
          ? undefined
          : new Date(Date.now() + 3 * 86400000).toISOString(),
    });

    try {
      const sheet = await syncRequestToSheet(updated || accredRequest, {
        lastAction: `Sendt via mailtransport (${approval.kind})`,
        emailThreadSource: threadId,
        nextFollowUp: approval.kind === 'applicant_notice' ? '' : 'Afvent svar',
      });
      if (sheet.rowNumber) {
        await updateRequest(accredRequest.id, { sheetRowNumber: sheet.rowNumber });
      }
    } catch (sheetErr) {
      await appendAudit({
        requestId: accredRequest.id,
        type: 'sheet_sync_error',
        detail: sheetErr instanceof Error ? sheetErr.message : String(sheetErr),
      });
    }

    await appendAudit({
      requestId: accredRequest.id,
      type: 'send',
      detail: `Sendt til ${approval.to}`,
      meta: {
        approvalId,
        threadId: threadId || null,
        resendEmailId: sendResult.resendEmailId || null,
        messageId: sendResult.messageId || null,
        sentCopyArchived: sendResult.sentCopyArchived ?? null,
        sentCopyMailbox: sendResult.sentCopyMailbox || null,
        kind: approval.kind,
      },
    });

    return NextResponse.json(
      createSuccessResponse(
        {
          resendEmailId: sendResult.resendEmailId,
          threadId,
          request: await getRequestById(accredRequest.id),
        },
        { requestId }
      )
    );
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
