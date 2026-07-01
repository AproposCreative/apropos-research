import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { runArticleTranslation } from '@/lib/webflow/article-translation';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);

  try {
    const body = (await req.json()) as { itemId?: string; source?: string; force?: boolean };
    const itemId = String(body.itemId || '').trim();
    if (!itemId) {
      return NextResponse.json(
        createErrorResponse('itemId er påkrævet.', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    requestLogger.info('Article translation job start', {
      itemId,
      source: body.source || 'internal',
    });

    const result = await runArticleTranslation(itemId, {
      source: body.source || 'internal',
      force: body.force === true,
    });

    return NextResponse.json(createSuccessResponse(result, { requestId }));
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    requestLogger.error('Article translation job error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Oversættelse fejlede.', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
        details: errorObj.message,
      }),
      { status: 500 }
    );
  }
}
