import { NextRequest, NextResponse } from 'next/server';
import { crawlStore } from '@/lib/crawler/store';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const crawlId = searchParams.get('crawlId');

    if (!crawlId) {
      requestLogger.warn('Missing crawlId');
      return NextResponse.json(
        createErrorResponse('crawlId is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const session = crawlStore.getSession(crawlId);
    if (!session) {
      requestLogger.warn('Crawl session not found', { crawlId });
      return NextResponse.json(
        createErrorResponse('Crawl session not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    return NextResponse.json(createSuccessResponse(session.status, { requestId }));
  } catch (error: any) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Status error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Failed to get status', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
