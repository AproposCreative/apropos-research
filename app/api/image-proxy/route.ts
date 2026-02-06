import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '../error-handler';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, ErrorCode } from '@/lib/api/types';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');
  
  if (!imageUrl) {
    requestLogger.warn('Missing url parameter');
    return NextResponse.json(
      createErrorResponse('Missing url parameter', {
        statusCode: 400,
        errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
        requestId,
      }),
      { status: 400 }
    );
  }

  // Validate URL format
  try {
    new URL(imageUrl);
  } catch {
    requestLogger.warn('Invalid URL format', { imageUrl: imageUrl.substring(0, 100) });
    return NextResponse.json(
      createErrorResponse('Invalid URL format', {
        statusCode: 400,
        errorCode: ErrorCode.VALIDATION,
        requestId,
      }),
      { status: 400 }
    );
  }

  try {
    requestLogger.debug('Fetching image', { imageUrl: imageUrl.substring(0, 100) });
    
    // Add timeout to prevent ETIMEDOUT errors
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    // Fetch image (Firebase Storage URLs don't need special headers, but others might)
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Ragekniv-UI/1.0)',
        'Referer': 'https://soundvenue.com/',
        'Accept': 'image/*',
      },
      signal: controller.signal,
      // Don't follow redirects automatically - handle them explicitly if needed
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    requestLogger.debug('Image fetch response', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      requestLogger.error('Failed to fetch image', new Error(`HTTP ${response.status}`), {
        status: response.status,
        statusText: response.statusText,
        errorPreview: errorText.substring(0, 200),
      });
      return NextResponse.json(
        createErrorResponse('Failed to fetch image', {
          statusCode: response.status,
          errorCode: ErrorCode.EXTERNAL_API,
          requestId,
        }),
        { status: response.status }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    requestLogger.info('Image proxied successfully', { contentType, size: imageBuffer.byteLength });

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*', // Allow CORS for images
        'Access-Control-Allow-Methods': 'GET',
      },
    });
  } catch (error) {
    const { error: errorMessage, status } = handleApiError(error, 'Image Proxy');
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Image proxy error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorMessage, {
        statusCode: status,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status }
    );
  }
}
