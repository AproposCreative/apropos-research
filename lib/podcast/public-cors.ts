import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = new Set([
  'https://www.aproposmagazine.com',
  'https://aproposmagazine.com',
  'https://www.aproposmagazine.dk',
  'https://aproposmagazine.dk',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export function resolvePodcastCorsOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;

  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      host === 'aproposmagazine.com' ||
      host.endsWith('.aproposmagazine.com') ||
      host === 'aproposmagazine.dk' ||
      host.endsWith('.aproposmagazine.dk') ||
      host.endsWith('.webflow.io')
    ) {
      return origin;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function podcastCorsHeaders(req: NextRequest): HeadersInit {
  const allowed = resolvePodcastCorsOrigin(req);
  const headers: Record<string, string> = {
    'Cache-Control': CACHE_CONTROL,
    Vary: 'Origin',
  };
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
}

export function podcastPublicOptions(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: podcastCorsHeaders(req),
  });
}

export function podcastPublicJson(
  req: NextRequest,
  body: unknown,
  init?: { status?: number }
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: podcastCorsHeaders(req),
  });
}
