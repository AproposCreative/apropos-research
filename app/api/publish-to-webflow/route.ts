import { NextRequest, NextResponse } from 'next/server';
import { WebflowCMS } from '@/lib/webflow-cms';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const articleData = await request.json();

    if (!articleData.title || !articleData.content) {
      requestLogger.warn('Missing required fields', { hasTitle: !!articleData.title, hasContent: !!articleData.content });
      return NextResponse.json(
        createErrorResponse('Title and content are required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const webflowCMS = new WebflowCMS();
    const result = await webflowCMS.publishArticle(articleData);

    if (!result.success) {
      requestLogger.error('Failed to publish to Webflow', new Error(result.error || 'Failed to publish to Webflow'));
      return NextResponse.json(
        createErrorResponse(result.error || 'Failed to publish to Webflow', {
          statusCode: 500,
          errorCode: ErrorCode.EXTERNAL_API,
          requestId,
        }),
        { status: 500 }
      );
    }

    requestLogger.info('Article published to Webflow', { itemId: result.itemId });

    return NextResponse.json(
      createSuccessResponse({
        itemId: result.itemId,
        message: 'Artikel publiseret til Webflow CMS'
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Publish to Webflow error', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to publish article to Webflow', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const { itemId, articleData } = await request.json();

    if (!itemId || !articleData) {
      requestLogger.warn('Missing required fields', { hasItemId: !!itemId, hasArticleData: !!articleData });
      return NextResponse.json(
        createErrorResponse('Item ID and article data are required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const webflowCMS = new WebflowCMS();
    const result = await webflowCMS.updateArticle(itemId, articleData);

    if (!result.success) {
      requestLogger.error('Failed to update Webflow article', new Error(result.error || 'Failed to update Webflow article'));
      return NextResponse.json(
        createErrorResponse(result.error || 'Failed to update Webflow article', {
          statusCode: 500,
          errorCode: ErrorCode.EXTERNAL_API,
          requestId,
        }),
        { status: 500 }
      );
    }

    requestLogger.info('Article updated in Webflow', { itemId });

    return NextResponse.json(
      createSuccessResponse({
        message: 'Artikel opdateret i Webflow CMS'
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Update Webflow article error', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to update article in Webflow', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const webflowCMS = new WebflowCMS();
    const result = await webflowCMS.getArticles();

    if (!result.success) {
      requestLogger.error('Failed to fetch articles from Webflow', new Error(result.error || 'Failed to fetch articles'));
      return NextResponse.json(
        createErrorResponse(result.error || 'Failed to fetch articles from Webflow', {
          statusCode: 500,
          errorCode: ErrorCode.EXTERNAL_API,
          requestId,
        }),
        { status: 500 }
      );
    }

    requestLogger.info('Fetched articles from Webflow', { count: result.articles?.length || 0 });

    return NextResponse.json(
      createSuccessResponse({
        articles: result.articles
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Get Webflow articles error', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to fetch articles from Webflow', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
