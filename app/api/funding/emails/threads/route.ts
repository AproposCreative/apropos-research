import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getRequestId } from '@/lib/api/request-utils';
import { createApplication } from '@/lib/funding/application-store';
import {
  createEmailThread,
  getThreadById,
  getThreadsByApplicationId,
  getThreadsByOpportunityId,
  readEmailThreads,
} from '@/lib/funding/email-thread-store';

export async function GET(request: NextRequest) {
  const applicationId = request.nextUrl.searchParams.get('applicationId');
  const opportunityId = request.nextUrl.searchParams.get('opportunityId');
  const threadId = request.nextUrl.searchParams.get('threadId');

  if (threadId) {
    const thread = getThreadById(threadId);
    if (!thread) {
      return NextResponse.json(
        createErrorResponse('Thread not found', { statusCode: 404, errorCode: ErrorCode.NOT_FOUND }),
        { status: 404 }
      );
    }
    return NextResponse.json(createSuccessResponse({ thread }));
  }

  let threads = readEmailThreads();
  if (applicationId) threads = getThreadsByApplicationId(applicationId);
  else if (opportunityId) threads = getThreadsByOpportunityId(opportunityId);

  return NextResponse.json(createSuccessResponse({ threads }));
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    const body = await request.json().catch(() => ({}));
    if (!body.opportunityId || !body.contactEmail || !body.subject) {
      return NextResponse.json(
        createErrorResponse('opportunityId, contactEmail and subject are required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    let applicationId = body.applicationId as string | undefined;
    if (!applicationId) {
      const app = createApplication({
        opportunityId: body.opportunityId,
        opportunityTitle: body.opportunityTitle,
        funder: body.funder,
        primaryContactEmail: body.contactEmail,
        status: 'researching',
      });
      applicationId = app.id;
    }

    const thread = createEmailThread({
      applicationId,
      opportunityId: body.opportunityId,
      contactEmail: body.contactEmail,
      contactName: body.contactName,
      subject: body.subject,
    });

    return NextResponse.json(createSuccessResponse({ thread, applicationId }, { requestId }));
  } catch (error) {
    return NextResponse.json(
      createErrorResponse(error instanceof Error ? error.message : 'Failed to create thread', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
