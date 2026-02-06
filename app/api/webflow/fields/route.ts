import { NextResponse } from 'next/server';
import { getArticleFields } from '@/lib/webflow-service';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function GET(request: Request) {
  const requestId = getRequestId(request as any);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const fields = await getArticleFields();
    
    requestLogger.info('Webflow article fields fetched', { count: fields?.length || 0 });
    
    return NextResponse.json(createSuccessResponse({ fields }, { requestId }));
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error fetching Webflow article fields', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to fetch article fields', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
