import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/** Routes that carry their own auth (webhooks, public unsubscribe links, health). */
const PUBLIC_API_PREFIXES = [
  '/api/health',
  '/api/webhooks/',
  '/api/newsletter/unsubscribe',
  '/api/newsletter/webhook/',
  '/api/podcast/public/',
  '/api/podcast/rss',
  '/api/podcast/feed.xml',
] as const;

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p
  );
}

function bearerToken(request: NextRequest): string {
  const authz = request.headers.get('authorization') || '';
  return authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
}

function internalSecret(): string | undefined {
  return process.env.INTERNAL_API_SECRET?.trim() || undefined;
}

function cronSecret(): string | undefined {
  return process.env.CRON_SECRET?.trim() || undefined;
}

function firebaseProjectId(): string | undefined {
  return (
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    undefined
  );
}

let firebaseJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getFirebaseJwks() {
  if (!firebaseJwks) {
    firebaseJwks = createRemoteJWKSet(
      new URL(
        'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
      )
    );
  }
  return firebaseJwks;
}

async function verifyFirebaseIdToken(token: string): Promise<boolean> {
  const projectId = firebaseProjectId();
  if (!projectId) return false;
  try {
    await jwtVerify(token, getFirebaseJwks(), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return true;
  } catch {
    return false;
  }
}

function hasInternalSecret(request: NextRequest): boolean {
  const secret = internalSecret();
  if (!secret) return false;
  const header = request.headers.get('x-internal-api-secret')?.trim();
  if (header && header === secret) return true;
  const bearer = bearerToken(request);
  return !!bearer && bearer === secret;
}

function hasCronSecret(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  return bearerToken(request) === secret;
}

/**
 * Returns true when the request may proceed to the API route handler.
 */
export async function isApiRequestAuthorized(request: NextRequest): Promise<boolean> {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api/')) return true;
  if (isPublicApiPath(pathname)) return true;

  if (hasInternalSecret(request) || hasCronSecret(request)) return true;

  const bearer = bearerToken(request);
  if (bearer) {
    const secret = internalSecret();
    const cron = cronSecret();
    if (secret && bearer === secret) return true;
    if (cron && bearer === cron) return true;
    if (await verifyFirebaseIdToken(bearer)) return true;
  }

  // Development without INTERNAL_API_SECRET: allow local iteration (production stays locked).
  if (process.env.NODE_ENV !== 'production' && !internalSecret()) {
    return true;
  }

  return false;
}
