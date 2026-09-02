import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { processInboundEmail } from '@/lib/liv-inbox/process';

export const runtime = 'nodejs';

/**
 * Feed one inbound email to Liv. Usable from the UI (manual/simulated intake)
 * and reusable from an IMAP poll or Resend inbound webhook later.
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const fromEmail = String(body.fromEmail || '').trim();
    const subject = String(body.subject || '').trim();
    const bodyText = String(body.body || '').trim();
    const fromName = body.fromName ? String(body.fromName).trim() : undefined;

    if (!fromEmail || !fromEmail.includes('@')) {
      return NextResponse.json(
        createErrorResponse('Ugyldig afsender-email.', {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 400 }
      );
    }
    if (!bodyText) {
      return NextResponse.json(
        createErrorResponse('Mailen mangler indhold.', {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 400 }
      );
    }

    const item = await processInboundEmail({
      fromEmail,
      fromName,
      subject: subject || '(intet emne)',
      body: bodyText,
    });
    return NextResponse.json(createSuccessResponse({ item }, { requestId }));
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
