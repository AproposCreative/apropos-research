import { NextRequest, NextResponse } from 'next/server';
import { isMediaReview, searchTMDB, searchGoogleImages, type MediaSearchRequest } from '@/lib/media-search-utils';
import { config } from '@/lib/config/env';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

interface SearchMediaImageRequest extends MediaSearchRequest {
  // Additional fields if needed
}

interface SearchMediaImageResponse {
  success: boolean;
  imageUrl?: string;
  source?: 'tmdb' | 'google' | 'unsplash';
  error?: string;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const data = await req.json() as SearchMediaImageRequest & { skipIndex?: number };
    
    if (!data.title) {
      requestLogger.warn('Missing title in request');
      return NextResponse.json(
        createErrorResponse('Title is required for media image search', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }
    
    const mediaCheck = isMediaReview(data);
    const { type, searchTerm } = mediaCheck;
    
    if (!type) {
      requestLogger.debug('Article does not appear to be media review', { title: data.title });
      return NextResponse.json(
        createErrorResponse('Article does not appear to be a film, TV series, or game review', {
          statusCode: 400,
          errorCode: ErrorCode.VALIDATION,
          requestId,
        }),
        { status: 400 }
      );
    }
    
    const skipIndex = data.skipIndex || 0;
    requestLogger.info('Searching for media image', { type, searchTerm, skipIndex });
    
    let imageUrl: string | null = null;
    let source: 'tmdb' | 'google' | 'unsplash' = 'tmdb';
    
    if (type === 'film' || type === 'tv') {
      // Try TMDB first (best quality, usually text-free)
      // skipIndex allows cycling through different images
      imageUrl = await searchTMDB(searchTerm, type, skipIndex);
      source = 'tmdb';
    } else if (type === 'game') {
      // Try Google Images for games
      imageUrl = await searchGoogleImages(searchTerm);
      source = 'google';
    }
    
    if (!imageUrl) {
      requestLogger.info('No image found', { type, searchTerm });
      return NextResponse.json(
        createErrorResponse(`No image found for ${type}: ${searchTerm}`, {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }
    
    // Process image to WebP format and compress to under 400KB (same as generate-image)
    let processedImageUrl = imageUrl;
    try {
      requestLogger.debug('Processing image to WebP format');
      const processResponse = await fetch(`${config.baseUrl}/api/process-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: imageUrl,
          maxSizeKB: 400,
          quality: 85
        })
      });
      
      if (processResponse.ok) {
        const processData = await processResponse.json();
        if (processData.success && processData.processedImageUrl) {
          processedImageUrl = processData.processedImageUrl;
          requestLogger.info('Image processed', {
            originalSizeKB: processData.originalSizeKB,
            processedSizeKB: processData.processedSizeKB,
          });
        }
      } else {
        requestLogger.debug('Image processing failed, using original image');
      }
    } catch (error) {
      requestLogger.debug('Image processing error, using original image', { error: String(error) });
    }
    
    requestLogger.info('Media image search completed', { type, source, found: !!processedImageUrl });

    return NextResponse.json(
      createSuccessResponse({
        imageUrl: processedImageUrl,
        source
      }, { requestId })
    );
    
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    requestLogger.error('Media image search error', errorObj);
    return NextResponse.json(
      createErrorResponse('Media image search failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
