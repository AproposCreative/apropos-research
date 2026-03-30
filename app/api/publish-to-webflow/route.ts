/**
 * @deprecated This route is deprecated. Use `/api/webflow/publish` instead.
 *
 * The canonical Webflow publish endpoint lives at `app/api/webflow/publish/route.ts`
 * and uses `publishArticleToWebflow` from `lib/webflow-service.ts`.
 *
 * This alternate route used `WebflowCMS` from `lib/webflow-cms.ts` and is no longer
 * called by any UI component. It is kept temporarily for backwards-compatibility but
 * will be removed in a future cleanup pass.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, ErrorCode } from '@/lib/api/types';

const DEPRECATION_MESSAGE =
  'This endpoint is deprecated. Use POST /api/webflow/publish instead.';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  return NextResponse.json(
    createErrorResponse(DEPRECATION_MESSAGE, {
      statusCode: 410,
      errorCode: ErrorCode.INTERNAL_ERROR,
      requestId,
      details: 'See /api/webflow/publish for the canonical publish endpoint.',
    }),
    { status: 410 }
  );
}

export async function PATCH(request: NextRequest) {
  const requestId = getRequestId(request);
  return NextResponse.json(
    createErrorResponse(DEPRECATION_MESSAGE, {
      statusCode: 410,
      errorCode: ErrorCode.INTERNAL_ERROR,
      requestId,
      details: 'See /api/webflow/publish for the canonical publish endpoint.',
    }),
    { status: 410 }
  );
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  return NextResponse.json(
    createErrorResponse(DEPRECATION_MESSAGE, {
      statusCode: 410,
      errorCode: ErrorCode.INTERNAL_ERROR,
      requestId,
      details: 'See /api/webflow/publish for the canonical publish endpoint.',
    }),
    { status: 410 }
  );
}
