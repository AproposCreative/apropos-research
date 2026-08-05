import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import {
  getApprovalById,
  listQueuedApprovals,
  readApprovals,
  setApprovalStatus,
  updateApprovalDraft,
} from '@/lib/accreditation/approval-store';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { draftHash } from '@/lib/accreditation/draft-template';
import { updateRequest } from '@/lib/accreditation/request-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const url = new URL(request.url);
  const all = url.searchParams.get('all') === '1';
  const items = all ? await readApprovals() : await listQueuedApprovals();
  return NextResponse.json(createSuccessResponse({ approvals: items }, { requestId }));
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim();
    const item = await getApprovalById(id);
    if (!item) {
      return NextResponse.json(
        createErrorResponse('Approval not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    if (action === 'edit') {
      const subject = body.subject != null ? String(body.subject) : item.subject;
      const text = body.text != null ? String(body.text) : item.text;
      const to = body.to != null ? String(body.to) : item.to;
      const updated = await updateApprovalDraft(id, {
        to,
        subject,
        text,
        draftHash: draftHash(subject, text),
      });
      return NextResponse.json(createSuccessResponse({ approval: updated }, { requestId }));
    }

    if (action === 'approve') {
      if (body.subject != null || body.text != null || body.to != null) {
        const subject = body.subject != null ? String(body.subject) : item.subject;
        const text = body.text != null ? String(body.text) : item.text;
        const to = body.to != null ? String(body.to) : item.to;
        await updateApprovalDraft(id, {
          to,
          subject,
          text,
          draftHash: draftHash(subject, text),
        });
      }
      const updated = await setApprovalStatus(id, 'approved');
      await appendAudit({
        requestId: item.requestId,
        type: 'approve',
        detail: `Godkendt: ${item.kind}`,
        meta: { approvalId: id },
      });
      return NextResponse.json(createSuccessResponse({ approval: updated }, { requestId }));
    }

    if (action === 'reject') {
      const reason = String(body.reason || '').trim();
      if (!reason) {
        return NextResponse.json(
          createErrorResponse('reject reason er påkrævet', {
            statusCode: 400,
            errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
            requestId,
          }),
          { status: 400 }
        );
      }
      const updated = await setApprovalStatus(id, 'rejected', { rejectReason: reason });
      await updateRequest(item.requestId, {
        status: item.kind === 'reply' ? 'replied' : 'draft_ready',
        notes: reason,
        pendingApprovalId: undefined,
      });
      await appendAudit({
        requestId: item.requestId,
        type: 'reject',
        detail: `Afvist: ${reason}`,
        meta: { approvalId: id },
      });
      return NextResponse.json(createSuccessResponse({ approval: updated }, { requestId }));
    }

    return NextResponse.json(
      createErrorResponse('action skal være approve|reject|edit', {
        statusCode: 400,
        errorCode: ErrorCode.INVALID_REQUEST,
        requestId,
      }),
      { status: 400 }
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
