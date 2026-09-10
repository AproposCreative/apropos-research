import { NextRequest, NextResponse } from 'next/server';
import { publishCanonicalArticleToWebflow } from '@/lib/articles/publish';
import { ArticleSaveError } from '@/lib/articles/save-receipt';
import { createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import type { ArticlePayload } from '@/lib/articles/article-payload';

/** Authentication is enforced by proxy.ts. This endpoint saves staged CMS data. */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const log = createRequestLogger(requestId);
  let raw: unknown;
  try { raw = await request.json(); }
  catch {
    return NextResponse.json(createErrorResponse('Request body must contain valid JSON', {
      statusCode: 400, errorCode: ErrorCode.INVALID_REQUEST, requestId,
    }), { status: 400 });
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json(createErrorResponse('Article must be a JSON object', {
      statusCode: 400, errorCode: ErrorCode.INVALID_REQUEST, requestId,
    }), { status: 400 });
  }
  const input = raw as ArticlePayload;
  if (typeof input.title !== 'string' || !input.title.trim() ||
      typeof input.content !== 'string' || !input.content.trim()) {
    return NextResponse.json(createErrorResponse('Title and content are required', {
      statusCode: 400, errorCode: ErrorCode.MISSING_REQUIRED_FIELD, requestId,
    }), { status: 400 });
  }
  if (input.webflowId !== undefined && input.webflowId !== '' &&
      (typeof input.webflowId !== 'string' || !/^[a-f0-9]{24}$/i.test(input.webflowId))) {
    return NextResponse.json(createErrorResponse('Invalid Webflow item ID', {
      statusCode: 400, errorCode: ErrorCode.INVALID_REQUEST, requestId,
    }), { status: 400 });
  }

  let savedArticleId: string | undefined;
  try {
    // Requested status is not proof of publication. This service stages data.
    const { articleId, receipt, publicationVerified } = await publishCanonicalArticleToWebflow({
      ...input, status: 'draft', workflowState: 'webflow_draft',
    }, { source: input.source || 'ai-writer', defaultStatus: 'draft' });
    savedArticleId = articleId;
    log.info('Staged article save verified', { articleId, saveState: receipt.saveState });
    return NextResponse.json(createSuccessResponse({
      articleId,
      ...receipt,
      publicationVerified,
      publicationBlocked: input.status === 'published',
      message: 'Artiklen er gemt i Webflow. Denne version er ikke bekræftet publiceret.',
    }, { requestId }));
  } catch (error) {
    if (error instanceof ArticleSaveError) savedArticleId = error.articleId;
    // Keep known IDs on readback failure. Never forward upstream bodies or secrets.
    log.warn('Webflow save could not be verified', { articleId: savedArticleId, requestId });
    return NextResponse.json({
      ...createErrorResponse(savedArticleId
        ? 'Artiklen har et CMS-ID, men gemningen kunne ikke verificeres. Genbrug samme ID ved næste forsøg.'
        : 'Gemningen kunne ikke bekræftes. Kontrollér CMS før et nyt oprettelsesforsøg.', {
        statusCode: 502, errorCode: ErrorCode.WEBFLOW_ERROR, requestId,
      }),
      ...(savedArticleId ? { articleId: savedArticleId } : {}),
      saveState: 'unverified',
      publicationVerified: false,
    }, { status: 502 });
  }
}
