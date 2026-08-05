import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { scanMailboxHistory } from '@/lib/accreditation/imap/history-scan';
import {
  readContactOverview,
  setContactReviewStatus,
} from '@/lib/accreditation/imap/contact-overview-store';
import type { MailboxId } from '@/lib/accreditation/imap/config';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  return NextResponse.json(
    createSuccessResponse({ overview: await readContactOverview() }, { requestId })
  );
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'scan').trim();

    if (action === 'review') {
      const email = String(body.email || '').trim();
      const status = body.status as 'pending' | 'accepted' | 'rejected';
      if (!email || !['pending', 'accepted', 'rejected'].includes(status)) {
        return NextResponse.json(
          createErrorResponse('email + status(pending|accepted|rejected) required', {
            statusCode: 400,
            errorCode: ErrorCode.INVALID_REQUEST,
            requestId,
          }),
          { status: 400 }
        );
      }
      const overview = await setContactReviewStatus(email, status);
      return NextResponse.json(createSuccessResponse({ overview }, { requestId }));
    }

    if (action === 'scan') {
      const mailboxes = (Array.isArray(body.mailboxes)
        ? body.mailboxes
        : ['liv', 'frederik']) as MailboxId[];
      const maxPerMailbox = Number(body.maxPerMailbox || 250);
      const result = await scanMailboxHistory(mailboxes, { maxPerMailbox });
      return NextResponse.json(createSuccessResponse(result, { requestId }));
    }

    return NextResponse.json(
      createErrorResponse('action must be scan|review', {
        statusCode: 400,
        errorCode: ErrorCode.INVALID_REQUEST,
        requestId,
      }),
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'History scan failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
