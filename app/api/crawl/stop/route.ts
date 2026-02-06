import { NextRequest, NextResponse } from 'next/server';
import { crawlStore } from '@/lib/crawler/store';
import { getCrawler, unregisterCrawler } from '@/lib/crawler/registry';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const body = await request.json();
    const { crawlId } = body;

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

    const crawler = getCrawler(crawlId);
    if (crawler) {
      await crawler.stop();
      unregisterCrawler(crawlId);
      requestLogger.info('Crawler stopped', { crawlId });
    } else {
      // Still update status even if crawler not found
      crawlStore.updateStatus(crawlId, {
        status: 'stopped',
        endTime: Date.now(),
      });
      requestLogger.warn('Crawler not found, updated status directly', { crawlId });
    }

    return NextResponse.json(createSuccessResponse({}, { requestId }));
  } catch (error: any) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Stop error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Failed to stop crawl', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
