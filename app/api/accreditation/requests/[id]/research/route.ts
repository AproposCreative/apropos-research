import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { appendAudit } from '@/lib/accreditation/audit-store';
import { researchAccreditationContact } from '@/lib/accreditation/research';
import { getRequestById, updateRequest } from '@/lib/accreditation/request-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
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

  try {
    await updateRequest(id, { status: 'researching' });
    const result = await researchAccreditationContact((await getRequestById(id))!);

    const nextStatus = result.ambiguous || result.contactConfidence === 'low'
      ? 'needs_contact'
      : 'draft_ready';

    const updated = await updateRequest(id, {
      status: nextStatus,
      contactName: result.contactName || item.contactName,
      contactEmail: result.contactEmail || item.contactEmail,
      promoter: result.promoter || item.promoter,
      contactConfidence: result.contactConfidence,
      previousCoverageUrl: result.previousCoverageUrl || item.previousCoverageUrl,
      researchNotes: result.notes,
    });

    await appendAudit({
      requestId: id,
      type: 'research',
      detail: `Research færdig → ${nextStatus} (${result.contactConfidence})`,
      meta: {
        contactEmail: result.contactEmail || null,
        ambiguous: result.ambiguous,
      },
    });

    return NextResponse.json(
      createSuccessResponse({ request: updated, research: result }, { requestId })
    );
  } catch (e) {
    await updateRequest(id, { status: 'needs_contact' });
    return NextResponse.json(
      createErrorResponse(e instanceof Error ? e.message : 'Research failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
