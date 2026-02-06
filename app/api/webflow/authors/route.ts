import { NextResponse } from 'next/server';
import { getWebflowAuthors } from '@/lib/webflow-service';
import { apiCache, CACHE_TTL } from '@/lib/cache';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function GET(request: Request) {
  const requestId = getRequestId(request as any);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const cacheKey = 'webflow:authors';
    
    // Try to get from cache first
    const cached = apiCache.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json(
        createSuccessResponse({ authors: cached, cached: true }, { requestId })
      );
    }
    
    // If not in cache, fetch from Webflow
    const authors = await getWebflowAuthors();
    
    // Store in cache for 15 minutes (authors don't change often)
    apiCache.set(cacheKey, authors, CACHE_TTL.LONG);
    
    requestLogger.info('Fetched Webflow authors', { count: authors.length, cached: false });
    
    return NextResponse.json(
      createSuccessResponse({ authors, cached: false }, { requestId })
    );
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error fetching Webflow authors', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to fetch authors', {
        statusCode: 500,
        errorCode: ErrorCode.EXTERNAL_API,
        requestId,
      }),
      { status: 500 }
    );
  }
}
