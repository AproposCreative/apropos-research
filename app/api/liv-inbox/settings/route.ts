import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getLivInboxSettings, updateLivInboxSettings } from '@/lib/liv-inbox/settings-store';
import { getAccreditationAgentModel } from '@/lib/accreditation/models';
import { livInboxSendingStatus } from '@/lib/liv-inbox/send';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  return NextResponse.json(
    createSuccessResponse(
      {
        settings: await getLivInboxSettings(),
        agentModel: getAccreditationAgentModel(),
        sending: livInboxSendingStatus(),
      },
      { requestId }
    )
  );
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    if (typeof body.autoRespond === 'boolean') patch.autoRespond = body.autoRespond;
    if (typeof body.guidelines === 'string') patch.guidelines = body.guidelines.slice(0, 8000);
    if (typeof body.signature === 'string') patch.signature = body.signature.slice(0, 600);
    if (body.confidenceThreshold !== undefined) patch.confidenceThreshold = body.confidenceThreshold;
    if (typeof body.editorNotes === 'string') patch.editorNotes = body.editorNotes.slice(0, 4000);
    if (typeof body.updatedBy === 'string') patch.updatedBy = body.updatedBy.slice(0, 120);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        createErrorResponse('Ingen gyldige felter at opdatere.', {
          statusCode: 400,
          errorCode: ErrorCode.INVALID_REQUEST,
          requestId,
        }),
        { status: 400 }
      );
    }

    const settings = await updateLivInboxSettings(patch);
    return NextResponse.json(
      createSuccessResponse(
        { settings, agentModel: getAccreditationAgentModel(), sending: livInboxSendingStatus() },
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
