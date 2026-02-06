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
    const url = searchParams.get('url');

    if (!crawlId || !url) {
      requestLogger.warn('Missing required parameters', { hasCrawlId: !!crawlId, hasUrl: !!url });
      return NextResponse.json(
        createErrorResponse('crawlId and url are required', {
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

    const pageData = crawlStore.getPage(crawlId, url);
    if (!pageData) {
      requestLogger.warn('Page not found', { crawlId, url });
      return NextResponse.json(
        createErrorResponse('Page not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    return NextResponse.json(createSuccessResponse(pageData, { requestId }));
  } catch (error: any) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Page error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Failed to get page', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
