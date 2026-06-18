import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { createRequestLogger } from '@/lib/logger';
import {
  createApplication,
  readApplications,
  updateApplication,
} from '@/lib/funding/application-store';
import type { ApplicationStatus } from '@/lib/funding/types';

const VALID_STATUSES: ApplicationStatus[] = [
  'discovered',
  'researching',
  'drafting',
  'submitted',
  'won',
  'lost',
  'skipped',
];

export async function GET(request: NextRequest) {
  const opportunityId = request.nextUrl.searchParams.get('opportunityId');
  let applications = readApplications();
  if (opportunityId) {
    applications = applications.filter((a) => a.opportunityId === opportunityId);
  }
  return NextResponse.json(createSuccessResponse({ applications }));
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);

  try {
    const body = await request.json().catch(() => ({}));
    if (!body.opportunityId || typeof body.opportunityId !== 'string') {
      return NextResponse.json(
        createErrorResponse('opportunityId is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const app = createApplication({
      opportunityId: body.opportunityId,
      opportunityTitle: body.opportunityTitle,
      funder: body.funder,
      status: VALID_STATUSES.includes(body.status) ? body.status : 'discovered',
      notes: body.notes,
      primaryContactEmail: body.primaryContactEmail,
    });

    requestLogger.info('Funding application created', { id: app.id });
    return NextResponse.json(createSuccessResponse({ application: app }, { requestId }));
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Create funding application failed', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to create application', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);

  try {
    const body = await request.json().catch(() => ({}));
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json(
        createErrorResponse('id is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const patch: Parameters<typeof updateApplication>[1] = {};
    if (VALID_STATUSES.includes(body.status)) patch.status = body.status;
    if (typeof body.notes === 'string') patch.notes = body.notes;
    if (typeof body.primaryContactEmail === 'string') patch.primaryContactEmail = body.primaryContactEmail;
    if (body.submittedAt) patch.submittedAt = body.submittedAt;

    const application = updateApplication(body.id, patch);
    if (!application) {
      return NextResponse.json(
        createErrorResponse('Application not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    requestLogger.info('Funding application updated', { id: application.id, status: application.status });
    return NextResponse.json(createSuccessResponse({ application }, { requestId }));
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Update funding application failed', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to update application', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
