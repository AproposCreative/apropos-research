/**
 * Google Search Console API auth (Search Analytics).
 * Separate scope from GA4 — product link does not imply GSC property access.
 */

import { GoogleAuth } from 'google-auth-library';
import { env } from '@/lib/config/env';

const WEBMASTERS_READONLY = 'https://www.googleapis.com/auth/webmasters.readonly';

let _auth: GoogleAuth | null = null;

export function getConfiguredGscSiteUrl(): string | null {
  const raw = env.GSC_SITE_URL?.trim();
  return raw || null;
}

/**
 * Server-side GSC auth via Firebase Admin service account.
 * Requires Search Console API enabled + SA added as user on the GSC property.
 */
export function getGscGoogleAuth(): GoogleAuth {
  if (_auth) return _auth;

  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!clientEmail || !privateKey) {
    throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL og FIREBASE_ADMIN_PRIVATE_KEY mangler');
  }

  _auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [WEBMASTERS_READONLY],
  });

  return _auth;
}

export async function getGscAccessToken(): Promise<string> {
  const client = await getGscGoogleAuth().getClient();
  const res = await client.getAccessToken();
  const token = typeof res === 'string' ? res : res?.token;
  if (!token) throw new Error('Kunne ikke hente GSC access token');
  return token;
}

/** Test helper — clear cached GoogleAuth between tests. */
export function clearGscAuthCacheForTests(): void {
  _auth = null;
}
