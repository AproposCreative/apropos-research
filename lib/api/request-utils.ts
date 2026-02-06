/**
 * Request Utilities
 * 
 * Helper functions for working with requests and request IDs.
 */

import { NextRequest } from 'next/server';

/**
 * Extract request ID from request headers
 * Falls back to generating a new one if not present
 */
export function getRequestId(request: NextRequest): string {
  return (
    request.headers.get('x-request-id') ||
    request.headers.get('x-vercel-request-id') ||
    generateRequestId()
  );
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Extract user ID from request (if available)
 * This can be extended to read from auth headers, cookies, etc.
 */
export function getUserId(request: NextRequest): string | undefined {
  // TODO: Implement based on your auth system
  // For now, return undefined
  return undefined;
}
