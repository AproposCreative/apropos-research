import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { createRequestLogger } from '@/lib/logger';
import { discoverSignals } from '@/lib/editorial/engine';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(3, Math.min(12, Number(body.limit) || 8));
    const coveredTopics = Array.isArray(body.coveredTopics) ? body.coveredTopics : [];
    const signals = await discoverSignals({ coveredTopics, limit });

    requestLogger.info('Generated editorial signals', { count: signals.length });
    return NextResponse.json(createSuccessResponse({ signals }, { requestId }));
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Editorial signal generation failed', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to generate editorial signals', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

