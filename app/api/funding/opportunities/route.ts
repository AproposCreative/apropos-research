import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { createRequestLogger } from '@/lib/logger';
import { discoverOpportunities } from '@/lib/funding/engine';
import { readStoredOpportunities } from '@/lib/funding/opportunity-store';

export async function GET() {
  const opportunities = readStoredOpportunities();
  return NextResponse.json(createSuccessResponse({ opportunities }));
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(3, Math.min(16, Number(body.limit) || 10));
    const coveredIds = Array.isArray(body.coveredIds) ? body.coveredIds.map(String) : [];
    const mergeStored = body.mergeStored !== false;

    const opportunities = await discoverOpportunities({ coveredIds, limit, mergeStored });

    requestLogger.info('Funding opportunities discovered', { count: opportunities.length });
    return NextResponse.json(createSuccessResponse({ opportunities }, { requestId }));
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Funding opportunity discovery failed', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to discover funding opportunities', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
