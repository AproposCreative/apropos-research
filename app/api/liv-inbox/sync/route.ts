import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getLivMailboxStatus, syncLivInbox } from '@/lib/liv-inbox/imap-sync';

export const runtime = 'nodejs';

/** Connection status for Liv's one.com inbox (no secrets exposed). */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  return NextResponse.json(
    createSuccessResponse({ mailbox: getLivMailboxStatus() }, { requestId })
  );
}

/** Pull new mail from Liv's one.com inbox and let Liv triage it. */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Number(body.limit) || undefined;
    const summary = await syncLivInbox({ limit });
    if (!summary.configured) {
      return NextResponse.json(
        createErrorResponse(summary.errors[0] || 'one.com-indbakken er ikke konfigureret.', {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 400 }
      );
    }
    return NextResponse.json(createSuccessResponse({ summary }, { requestId }));
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
