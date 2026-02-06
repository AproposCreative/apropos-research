/**
 * API Types and Response Utilities
 * 
 * Standardized types for API requests and responses across the application.
 */

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  errorCode?: string;
  errorCategory?: string;
  details?: string;
  requestId?: string;
  timestamp?: string;
  // Only included in development
  stack?: string;
}

/**
 * Standard API success response wrapper
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  requestId?: string;
  timestamp?: string;
}

/**
 * Standard API response (success or error)
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Check if response is an error
 */
export function isApiError(response: ApiResponse): response is ApiErrorResponse {
  return 'error' in response;
}

/**
 * Check if response is successful
 */
export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return 'success' in response && response.success === true;
}

/**
 * Error categories for consistent error handling
 */
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  NETWORK = 'network',
  EXTERNAL_API = 'external_api',
  PARSING = 'parsing',
  INTERNAL = 'internal',
  UNKNOWN = 'unknown',
}

/**
 * HTTP status codes mapped to error categories
 */
export const STATUS_TO_CATEGORY: Record<number, ErrorCategory> = {
  400: ErrorCategory.VALIDATION,
  401: ErrorCategory.AUTHENTICATION,
  403: ErrorCategory.AUTHORIZATION,
  404: ErrorCategory.NOT_FOUND,
  408: ErrorCategory.TIMEOUT,
  429: ErrorCategory.RATE_LIMIT,
  500: ErrorCategory.INTERNAL,
  502: ErrorCategory.EXTERNAL_API,
  503: ErrorCategory.NETWORK,
  504: ErrorCategory.TIMEOUT,
};

/**
 * Error code constants
 */
export enum ErrorCode {
  // Authentication
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_API_KEY = 'INVALID_API_KEY',
  
  // Validation
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  VALIDATION = 'VALIDATION',
  
  // Not Found
  NOT_FOUND = 'NOT_FOUND',
  
  // External APIs
  OPENAI_ERROR = 'OPENAI_ERROR',
  WEBFLOW_ERROR = 'WEBFLOW_ERROR',
  TMDB_ERROR = 'TMDB_ERROR',
  
  // Rate Limits
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Timeouts
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  
  // Internal
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: string | Error,
  options?: {
    statusCode?: number;
    errorCode?: ErrorCode | string;
    errorCategory?: ErrorCategory;
    details?: string;
    requestId?: string;
  }
): ApiErrorResponse {
  const message = typeof error === 'string' ? error : error.message;
  const statusCode = options?.statusCode || 500;
  const category = options?.errorCategory || STATUS_TO_CATEGORY[statusCode] || ErrorCategory.UNKNOWN;
  
  return {
    error: message,
    errorCode: options?.errorCode,
    errorCategory: category,
    details: options?.details,
    requestId: options?.requestId || generateRequestId(),
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && typeof error !== 'string' && error.stack && {
      stack: error.stack,
    }),
  };
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  options?: {
    requestId?: string;
  }
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    requestId: options?.requestId || generateRequestId(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Extract error category from error message or type
 */
export function categorizeError(error: Error | string): ErrorCategory {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('api key') || lowerMessage.includes('authentication')) {
    return ErrorCategory.AUTHENTICATION;
  }
  if (lowerMessage.includes('rate limit')) {
    return ErrorCategory.RATE_LIMIT;
  }
  if (lowerMessage.includes('timeout')) {
    return ErrorCategory.TIMEOUT;
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('econnrefused')) {
    return ErrorCategory.NETWORK;
  }
  if (lowerMessage.includes('json') || lowerMessage.includes('parse')) {
    return ErrorCategory.PARSING;
  }
  if (lowerMessage.includes('openai') || lowerMessage.includes('webflow') || lowerMessage.includes('tmdb')) {
    return ErrorCategory.EXTERNAL_API;
  }
  
  return ErrorCategory.UNKNOWN;
}
