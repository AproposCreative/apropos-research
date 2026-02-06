import { NextResponse } from 'next/server';
import { ingestOnce } from '../../../src/cli/ingest-rage';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function GET(request: Request) {
  const requestId = getRequestId(request as any);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    requestLogger.info('Test ingestion started');
    
    // Run a small test ingestion (last 24 hours, limit 10)
    const result = await ingestOnce({ sinceHrs: 24, limit: 10 });
    
    requestLogger.info('Test ingestion completed', { result });
    
    return NextResponse.json(
      createSuccessResponse({
        result,
        message: 'Test ingestion completed'
      }, { requestId })
    );
  } catch (error: any) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Test ingestion failed', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Test ingestion failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
        details: errorObj.stack,
      }),
      { status: 500 }
    );
  }
}

