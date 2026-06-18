import { GoogleAuth } from 'google-auth-library';
import { env } from '@/lib/config/env';

const ANALYTICS_READONLY = 'https://www.googleapis.com/auth/analytics.readonly';

let _auth: GoogleAuth | null = null;

/**
 * Server-side GA4 Data API auth via Firebase Admin service account.
 * Kræver Viewer på GA4-property + Analytics Data API enabled på GCP-projektet.
 */
export function getGa4GoogleAuth(): GoogleAuth {
  if (_auth) return _auth;

  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!clientEmail || !privateKey) {
    throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL og FIREBASE_ADMIN_PRIVATE_KEY mangler');
  }

  _auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [ANALYTICS_READONLY],
  });

  return _auth;
}

export async function getGa4AccessToken(): Promise<string> {
  const client = await getGa4GoogleAuth().getClient();
  const res = await client.getAccessToken();
  const token = typeof res === 'string' ? res : res?.token;
  if (!token) throw new Error('Kunne ikke hente GA4 access token');
  return token;
}
