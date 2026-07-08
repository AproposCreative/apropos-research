import { NextRequest, NextResponse } from 'next/server';
import { publishCanonicalArticleToWebflow } from '@/lib/articles/publish';
import { createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import type { ArticlePayload } from '@/lib/articles/article-payload';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const articleData: ArticlePayload = await request.json();
    
    // Debug: Log what we receive
    requestLogger.debug('Received article data for Webflow publish', {
      title: articleData.title,
      slug: articleData.slug,
      subtitle: articleData.subtitle,
      content: articleData.content?.substring(0, 100) + '...',
      excerpt: articleData.excerpt,
      category: articleData.category,
      tags: articleData.tags,
      author: articleData.author,
      rating: articleData.rating,
      seoTitle: articleData.seoTitle,
      seoDescription: articleData.seoDescription,
      readTime: articleData.readTime,
      wordCount: articleData.wordCount,
      featured: articleData.featured,
      trending: articleData.trending,
      featuredImage: articleData.featuredImage ? (articleData.featuredImage.startsWith('data:image/') ? 'Data URL (base64)' : 'HTTP URL') : 'Missing',
      featuredImagePreview: articleData.featuredImage ? articleData.featuredImage.substring(0, 100) + '...' : 'N/A',
      streaming_service: articleData.streaming_service,
      platform: articleData.platform,
      watchUrl: articleData.watchUrl
    });
    
    // Validate required fields
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

    // Check if this is an update to existing article
    const isUpdate = articleData.webflowId && articleData.webflowId !== '';
    requestLogger.info('Publish mode', { 
      mode: isUpdate ? 'UPDATE' : 'CREATE',
      webflowId: articleData.webflowId || undefined,
    });

    // Publish to Webflow through the canonical article pipeline.
    const { articleId } = await publishCanonicalArticleToWebflow(articleData, {
      source: articleData.source || 'ai-writer',
      defaultStatus: 'draft',
    });

    requestLogger.info('Article published successfully to Webflow', { articleId });

    return NextResponse.json(
      createSuccessResponse({
        articleId,
        message: 'Article published successfully to Webflow'
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error publishing article', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to publish article', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
        details: errorObj.message,
      }),
      { status: 500 }
    );
  }
}
