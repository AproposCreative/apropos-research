/**
 * Next.js Middleware
 * 
 * Adds request ID to all requests for tracing and logging.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function middleware(request: NextRequest) {
  // Generate or extract request ID
  const requestId = 
    request.headers.get('x-request-id') || 
    request.headers.get('x-vercel-request-id') || 
    generateRequestId();

  // Clone request headers and add request ID
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // Create response with request ID in headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Add request ID to response headers for client-side access
  response.headers.set('x-request-id', requestId);

  return response;
}

/**
 * Configure which routes the middleware runs on
 * By default, it runs on all routes except static files and API routes
 * We want it on API routes too, so we'll use a matcher
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
