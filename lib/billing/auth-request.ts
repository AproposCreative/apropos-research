import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export async function getFirebaseUidFromRequest(
  request: NextRequest
): Promise<{ uid: string; email?: string } | null> {
  const authz = request.headers.get('authorization') || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!bearer) return null;

  const adminAuth = getAdminAuth();
  if (!adminAuth) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(bearer);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
