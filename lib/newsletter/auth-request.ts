import type { NextRequest } from 'next/server';
import { env } from '@/lib/config/env';
import { getAdminAuth } from '@/lib/firebase-admin';

/**
 * Firebase-brugerens UID fra `Authorization: Bearer <idToken>`.
 * Returnerer null hvis token mangler, er ugyldig, eller matcher `CRON_SECRET`.
 */
export async function getNewsletterUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const authz = req.headers.get('authorization') || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!bearer) return null;
  if (env.CRON_SECRET && bearer === env.CRON_SECRET) return null;

  const adminAuth = getAdminAuth();
  if (!adminAuth) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * Tillad kald med Vercel cron (`Authorization: Bearer CRON_SECRET`)
 * eller indlogget Firebase-bruger (`Authorization: Bearer <idToken>`).
 */
export async function authorizeNewsletterRequest(req: NextRequest): Promise<boolean> {
  const authz = req.headers.get('authorization') || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!bearer) return false;

  if (env.CRON_SECRET && bearer === env.CRON_SECRET) return true;

  const adminAuth = getAdminAuth();
  if (!adminAuth) return false;
  try {
    await adminAuth.verifyIdToken(bearer);
    return true;
  } catch {
    return false;
  }
}
