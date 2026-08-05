import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { createRequest, readRequests } from '@/lib/accreditation/request-store';
import type { AccreditationApplicant } from '@/lib/accreditation/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const requests = (await readRequests()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return NextResponse.json(createSuccessResponse({ requests }, { requestId }));
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

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const artist = String(body.artist || '').trim();
    if (!artist) {
      return NextResponse.json(
        createErrorResponse('artist er påkrævet', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const applicants: AccreditationApplicant[] = Array.isArray(body.applicants)
      ? body.applicants
          .map((a: { name?: string; email?: string; notes?: string }) => ({
            name: String(a?.name || '').trim(),
            email: a?.email ? String(a.email).trim() : undefined,
            notes: a?.notes ? String(a.notes).trim() : undefined,
          }))
          .filter((a: AccreditationApplicant) => a.name)
      : body.applicant
        ? [{ name: String(body.applicant).trim() }]
        : [];

    const created = await createRequest({
      artist,
      venue: body.venue ? String(body.venue) : undefined,
      eventDate: body.eventDate || body.date ? String(body.eventDate || body.date) : undefined,
      applicants,
      accessRequested: body.accessRequested ? String(body.accessRequested) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    });

    await appendAudit({
      requestId: created.id,
      type: 'intake',
      detail: `Ny anmodning: ${created.artist}`,
    });

    return NextResponse.json(createSuccessResponse({ request: created }, { requestId }));
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
