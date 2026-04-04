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
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/ai';
    return NextResponse.redirect(url, 308);
  }

  const requestId = 
    request.headers.get('x-request-id') || 
    request.headers.get('x-vercel-request-id') || 
    generateRequestId();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

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
