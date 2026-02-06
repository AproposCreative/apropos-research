import { NextRequest, NextResponse } from 'next/server';
import { WebflowAuthors } from '@/lib/webflow-authors';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const webflowAuthors = new WebflowAuthors();
    const result = await webflowAuthors.getAuthors();

    if (!result.success) {
      requestLogger.error('Failed to fetch authors', new Error(result.error || 'Failed to fetch authors'));
      return NextResponse.json(
        createErrorResponse(result.error || 'Failed to fetch authors', {
          statusCode: 500,
          errorCode: ErrorCode.EXTERNAL_API,
          requestId,
        }),
        { status: 500 }
      );
    }

    requestLogger.info('Authors fetched successfully', { count: result.authors?.length || 0 });

    return NextResponse.json(
      createSuccessResponse({
        authors: result.authors
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Get authors error', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to fetch authors', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
