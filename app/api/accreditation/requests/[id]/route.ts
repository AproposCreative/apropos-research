import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { listAuditForRequest } from '@/lib/accreditation/audit-store';
import { getThreadsByRequestId } from '@/lib/accreditation/email-thread-store';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';
import type { AccreditationRequestStatus } from '@/lib/accreditation/types';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(request);
  const { id } = await ctx.params;
  const item = await getRequestById(id);
  if (!item) {
    return NextResponse.json(
      createErrorResponse('Not found', { statusCode: 404, errorCode: ErrorCode.NOT_FOUND, requestId }),
      { status: 404 }
    );
  }
  return NextResponse.json(
    createSuccessResponse(
      {
        request: item,
        threads: await getThreadsByRequestId(id),
        audit: await listAuditForRequest(id),
      },
      { requestId }
    )
  );
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(request);
  const { id } = await ctx.params;
  try {
    const body = await request.json().catch(() => ({}));
    const updated = await updateRequest(id, {
      ...(body.artist != null ? { artist: String(body.artist) } : {}),
      ...(body.venue != null ? { venue: String(body.venue) } : {}),
      ...(body.eventDate != null ? { eventDate: String(body.eventDate) } : {}),
      ...(body.promoter != null ? { promoter: String(body.promoter) } : {}),
      ...(body.contactName != null ? { contactName: String(body.contactName) } : {}),
      ...(body.contactEmail != null ? { contactEmail: String(body.contactEmail) } : {}),
      ...(body.contactConfidence != null
        ? { contactConfidence: body.contactConfidence }
        : {}),
      ...(body.accessRequested != null ? { accessRequested: String(body.accessRequested) } : {}),
      ...(body.notes != null ? { notes: String(body.notes) } : {}),
      ...(body.outcomeReason != null ? { outcomeReason: String(body.outcomeReason) } : {}),
      ...(body.status != null ? { status: body.status as AccreditationRequestStatus } : {}),
      ...(body.previousCoverageUrl != null
        ? { previousCoverageUrl: String(body.previousCoverageUrl) }
        : {}),
      ...(Array.isArray(body.applicants) ? { applicants: body.applicants } : {}),
    });
    if (!updated) {
      return NextResponse.json(
        createErrorResponse('Not found', { statusCode: 404, errorCode: ErrorCode.NOT_FOUND, requestId }),
        { status: 404 }
      );
    }
    return NextResponse.json(createSuccessResponse({ request: updated }, { requestId }));
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
