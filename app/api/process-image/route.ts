import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { optimizeAndUploadImage } from '@/lib/images/optimize-and-upload';

interface ProcessImageRequest {
  imageUrl: string;
  maxSizeKB?: number;
  quality?: number;
  maxLongEdge?: number;
  baseName?: string;
  role?: string;
}

interface ProcessImageResponse {
  success: boolean;
  processedImageUrl?: string;
  originalSizeKB?: number;
  processedSizeKB?: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const {
      imageUrl,
      maxSizeKB = 400,
      quality = 85,
      maxLongEdge = 1200,
      baseName,
      role,
    } = await req.json() as ProcessImageRequest;

    if (!imageUrl) {
      requestLogger.warn('Missing imageUrl in request');
      return NextResponse.json(
        createErrorResponse('Image URL is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    requestLogger.info('Processing image', { imageUrl: imageUrl.substring(0, 100) });

    const result = await optimizeAndUploadImage({
      imageUrl,
      maxSizeKB,
      maxLongEdge,
      qualityStart: quality,
      qualityMin: 35,
      folder: 'processed-images',
      baseName,
      role,
    });

    return NextResponse.json(
      createSuccessResponse({
        processedImageUrl: result.url,
        originalSizeKB: result.originalSizeKB,
        processedSizeKB: result.processedSizeKB,
        fileName: result.fileName,
        width: result.width,
        height: result.height,
      }, { requestId })
    );

  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    requestLogger.error('Image processing error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Image processing failed', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
