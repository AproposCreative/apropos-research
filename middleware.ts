/**
 * Next.js Middleware
 *
 * - Redirects / → /ai
 * - Protects /api/* with INTERNAL_API_SECRET, CRON_SECRET, or Firebase ID token
 * - Adds request ID for tracing
 */

import { NextRequest, NextResponse } from 'next/server';
import { isApiRequestAuthorized } from '@/lib/api/middleware-auth';

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/ai';
    return NextResponse.redirect(url, 308);
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const authorized = await isApiRequestAuthorized(request);
    if (!authorized) {
      // Include CORS on 401 so browser consoles show auth errors instead of opaque CORS failures
      // for magazine origins hitting public podcast endpoints during misconfig.
      const origin = request.headers.get('origin');
      const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
      if (
        origin &&
        (/^https:\/\/([a-z0-9-]+\.)*aproposmagazine\.(com|dk)$/i.test(origin) ||
          origin.endsWith('.webflow.io') ||
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:'))
      ) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
        headers.Vary = 'Origin';
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
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
