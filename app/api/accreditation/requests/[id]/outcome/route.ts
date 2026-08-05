import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';
import { syncRequestToSheet } from '@/lib/accreditation/sheet-client';
import { updateThreadStatus, getThreadsByRequestId } from '@/lib/accreditation/email-thread-store';

export const runtime = 'nodejs';

/** Set granted/denied and optionally prepare for applicant notification. */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(request);
  const { id } = await ctx.params;
  try {
    const body = await request.json().catch(() => ({}));
    const outcome = body.outcome === 'denied' ? 'denied' : body.outcome === 'granted' ? 'granted' : null;
    if (!outcome) {
      return NextResponse.json(
        createErrorResponse('outcome skal være granted|denied', {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 400 }
      );
    }

    const item = await getRequestById(id);
    if (!item) {
      return NextResponse.json(
        createErrorResponse('Not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    const reason = body.reason ? String(body.reason).trim() : undefined;
    const updated = await updateRequest(id, {
      status: outcome,
      outcomeReason: reason || (outcome === 'granted' ? 'Adgang givet' : 'Afvist'),
    });

    for (const t of await getThreadsByRequestId(id)) {
      await updateThreadStatus(t.id, 'closed');
    }

    try {
      if (updated) {
        await syncRequestToSheet(updated, {
          lastAction: `Outcome: ${outcome}`,
          nextFollowUp: '',
          emailThreadSource: updated.threadId || '',
        });
      }
    } catch (e) {
      await appendAudit({
        requestId: id,
        type: 'sheet_sync_error',
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    await appendAudit({
      requestId: id,
      type: 'outcome',
      detail: `${outcome}${reason ? `: ${reason}` : ''}`,
    });

    // Move to notifying_applicants so UI can draft applicant notice
    const notifying = await updateRequest(id, { status: 'notifying_applicants' });

    return NextResponse.json(
      createSuccessResponse({ request: notifying || updated }, { requestId })
    );
  } catch (e) {
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Failed', {
        statusCode: 400,
        errorCode: ErrorCode.INVALID_REQUEST,
        requestId,
      }),
      { status: 400 }
    );
  }
}
