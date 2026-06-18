import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { createRequestLogger } from '@/lib/logger';
import { runEditorialResearch } from '@/lib/editorial/engine';
import type { EditorialSignal } from '@/lib/editorial/types';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);

  try {
    const body = await request.json().catch(() => ({}));
    const signal = body.signal as EditorialSignal | undefined;
    const coveredTopics = Array.isArray(body.coveredTopics) ? body.coveredTopics : [];

    if (!signal?.id || !signal?.title) {
      requestLogger.warn('Missing signal in editorial research request');
      return NextResponse.json(
        createErrorResponse('Signal is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const result = await runEditorialResearch(signal, { coveredTopics });
    requestLogger.info('Editorial research completed', {
      signalId: signal.id,
      sourceCount: result.dossier.sources.length,
      qualityScore: result.qualityGate.score,
    });

    return NextResponse.json(createSuccessResponse(result, { requestId }));
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Editorial research failed', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to run editorial research', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

