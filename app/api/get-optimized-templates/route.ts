import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const templatesFile = path.join(process.cwd(), 'data', 'optimized-templates.json');
    
    if (!fs.existsSync(templatesFile)) {
      requestLogger.warn('Optimized templates file not found');
      return NextResponse.json(
        createErrorResponse('Optimized templates not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    const templatesData = fs.readFileSync(templatesFile, 'utf8');
    const templates = JSON.parse(templatesData);

    requestLogger.info('Optimized templates loaded', { count: Array.isArray(templates) ? templates.length : 'unknown' });

    return NextResponse.json(createSuccessResponse(templates, { requestId }));
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error loading optimized templates', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to load optimized templates', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
