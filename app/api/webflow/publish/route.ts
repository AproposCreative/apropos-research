import { NextRequest, NextResponse } from 'next/server';
import { publishArticleToWebflow, WebflowArticleFields } from '@/lib/webflow-service';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const articleData: WebflowArticleFields = await request.json();
    
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

    // Generate slug if not provided
    if (!articleData.slug) {
      articleData.slug = articleData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim();
    }

    // Set default values
    articleData.publishDate = articleData.publishDate || new Date().toISOString();
    articleData.status = articleData.status || 'draft';
    articleData.wordCount = articleData.content.split(' ').length;
    articleData.readTime = Math.ceil(articleData.wordCount / 200); // ~200 words per minute
    // Safety default: mark AI-generated content when payload indicates AI origin.
    if (
      articleData.aiGenerated === undefined ||
      articleData.aiGenerated === null
    ) {
      const looksAiAuthored =
        !!articleData.aiModel ||
        !!articleData.aiSourceUrl ||
        String(articleData.author || '').trim().toLowerCase() === 'liv brandt';
      if (looksAiAuthored) {
        articleData.aiGenerated = true;
      }
    }

    // Check if this is an update to existing article
    const isUpdate = articleData.webflowId && articleData.webflowId !== '';
    requestLogger.info('Publish mode', { 
      mode: isUpdate ? 'UPDATE' : 'CREATE',
      webflowId: articleData.webflowId || undefined,
    });

    // Publish to Webflow
    const articleId = await publishArticleToWebflow(articleData);

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
