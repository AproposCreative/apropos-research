/**
 * Enhanced API Error Handler
 * 
 * Provides consistent error handling and response formatting for API routes.
 */

import { NextResponse } from 'next/server';
import { createErrorResponse, categorizeError, ErrorCode, ErrorCategory } from '@/lib/api/types';
import { logger } from '@/lib/logger';

/**
 * Handle API errors and return standardized error response
 */
export function handleApiError(
  error: unknown,
  context?: {
    requestId?: string;
    operation?: string;
    statusCode?: number;
    errorCode?: ErrorCode | string;
  }
): NextResponse<import('@/lib/api/types').ApiErrorResponse> {
  const requestId = context?.requestId || generateRequestId();
  const operation = context?.operation || 'API';
  
  // Extract error details
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const category = categorizeError(errorObj);
  
  // Determine status code
  let statusCode = context?.statusCode || 500;
  if (errorObj.name === 'AbortError' || errorObj.message.includes('timeout')) {
    statusCode = 408;
  } else if ((errorObj as any).code === 'ETIMEDOUT') {
    statusCode = 408;
  } else if ((errorObj as any).code === 'ENOTFOUND') {
    statusCode = 404;
  } else if ((errorObj as any).code === 'ECONNREFUSED') {
    statusCode = 503;
  }
  
  // Log error
  logger.error(`${operation} error`, errorObj, {
    requestId,
    operation,
    statusCode,
    category,
  });
  
  // Create standardized error response
  const errorResponse = createErrorResponse(errorObj, {
    statusCode,
    errorCode: context?.errorCode,
    errorCategory: category,
    requestId,
  });
  
  return NextResponse.json(errorResponse, { status: statusCode });
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Wrap async route handlers with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  options?: {
    operation?: string;
  }
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args[0] as { headers?: Headers };
      const requestId = request.headers?.get('x-request-id') || undefined;
      
      return handleApiError(error, {
        requestId,
        operation: options?.operation || handler.name,
      });
    }
  }) as T;
}
