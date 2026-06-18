import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { appendOutboundMessage, getThreadById, updateThreadStatus } from '@/lib/funding/email-thread-store';
import { getFundingFromEmail, sendFundingEmail } from '@/lib/funding/send-email';

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.5;color:#111">${escaped.replace(/\n/g, '<br/>')}</div>`;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const threadId = body.threadId as string | undefined;
    const to = (body.to as string | undefined)?.trim();
    const subject = (body.subject as string | undefined)?.trim();
    const text = (body.text as string | undefined)?.trim();
    const html = (body.html as string | undefined)?.trim();

    if (!threadId || !to || !subject || (!text && !html)) {
      return NextResponse.json(
        createErrorResponse('threadId, to, subject and text/html are required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const thread = getThreadById(threadId);
    if (!thread) {
      return NextResponse.json(
        createErrorResponse('Thread not found', { statusCode: 404, errorCode: ErrorCode.NOT_FOUND, requestId }),
        { status: 404 }
      );
    }

    if (!getFundingFromEmail().includes('@')) {
      return NextResponse.json(
        createErrorResponse('FUNDING_FROM_EMAIL er ikke konfigureret', {
          statusCode: 503,
          errorCode: ErrorCode.INTERNAL_ERROR,
          requestId,
        }),
        { status: 503 }
      );
    }

    const bodyHtml = html || textToHtml(text || '');
    const sendResult = await sendFundingEmail({
      to,
      subject,
      html: bodyHtml,
      text: text || undefined,
      threadId: thread.id,
      applicationId: thread.applicationId,
      opportunityId: thread.opportunityId,
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        createErrorResponse(sendResult.error || 'Send failed', {
          statusCode: 500,
          errorCode: ErrorCode.INTERNAL_ERROR,
          requestId,
        }),
        { status: 500 }
      );
    }

    const from = getFundingFromEmail();
    const updated = appendOutboundMessage(threadId, {
      resendEmailId: sendResult.resendEmailId,
      from,
      to,
      subject,
      html: bodyHtml,
      text: text || undefined,
      sentAt: new Date().toISOString(),
      deliveryStatus: 'sent',
    });

    updateThreadStatus(threadId, 'awaiting_reply');

    return NextResponse.json(createSuccessResponse({ thread: updated, resendEmailId: sendResult.resendEmailId }, { requestId }));
  } catch (error) {
    return NextResponse.json(
      createErrorResponse(error instanceof Error ? error.message : 'Send failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
