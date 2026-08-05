import { GoogleAuth } from 'google-auth-library';
import { env } from '@/lib/config/env';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let _auth: GoogleAuth | null = null;

export function getAccreditationSheetsAuth(): GoogleAuth {
  if (_auth) return _auth;

  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!clientEmail || !privateKey) {
    throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL og FIREBASE_ADMIN_PRIVATE_KEY mangler til Sheets');
  }

  _auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [SHEETS_SCOPE],
  });

  return _auth;
}

export async function getSheetsAccessToken(): Promise<string> {
  const client = await getAccreditationSheetsAuth().getClient();
  const res = await client.getAccessToken();
  const token = typeof res === 'string' ? res : res?.token;
  if (!token) throw new Error('Kunne ikke hente Sheets access token');
  return token;
}
