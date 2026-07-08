import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { createRequestLogger } from '@/lib/logger';
import { performSourceSearch } from '@/lib/editorial/search';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  let query: string | undefined;

  try {
    const requestBody = await request.json();
    const { query: reqQuery, maxResults = 5 } = requestBody;
    query = reqQuery;

    if (!query) {
      requestLogger.warn('Missing query in request');
      return NextResponse.json(
        createErrorResponse('Query is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const searchResults = await performSourceSearch(query, {
      maxResults,
      strategy: 'api',
      logger: requestLogger,
    });

    requestLogger.info('Web search completed', {
      query,
      resultsCount: searchResults.length,
    });

    return NextResponse.json(
      createSuccessResponse(
        {
          query,
          results: searchResults,
          totalResults: searchResults.length,
        },
        { requestId }
      )
    );
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Web search error', errorObj, { query: query || 'unknown' });
    return NextResponse.json(
      createErrorResponse('Failed to perform web search', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

