import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';

/** Read-only application requests. Creates one temporary Firebase Auth identity
 * to prove a valid token from outside the allowlist is rejected, then deletes it.
 */
export async function verifyEditorialLoginLive(origin: string) {
  if (new URL(origin).origin !== 'https://ai.aproposmagazine.com') throw new Error('unexpected_verification_origin');
  const admin = getAdminAuth();
  const uid = process.env.SEO_ENGINE_ADMIN_UIDS?.split(',')[0]?.trim();
  if (!admin || !uid) throw new Error('admin_verification_missing');
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `login-verification-${randomUUID()}`);
  const auth = getAuth(app);
  let temporaryUid: string | undefined;
  async function check(token?: string) {
    const response = await fetch(`${origin}/api/auth/access`, { redirect: 'error',
      headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    return { status: response.status, allowed: result.allowed, role: result.role };
  }
  try {
    const anonymous = await check();
    if (![401, 403].includes(anonymous.status)) throw new Error('anonymous_login_not_denied');
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(uid));
    const allowed = await check(await signed.user.getIdToken());
    if (allowed.status !== 200 || allowed.allowed !== true || allowed.role !== 'admin') throw new Error('admin_login_failed');
    await signOut(auth);
    const outsider = await admin.createUser({ email: `verification-${randomUUID()}@example.invalid`, emailVerified: true });
    temporaryUid = outsider.uid;
    const outsiderSession = await signInWithCustomToken(auth, await admin.createCustomToken(outsider.uid));
    const denied = await check(await outsiderSession.user.getIdToken());
    if (![401, 403].includes(denied.status) || denied.allowed === true) throw new Error('outsider_login_not_denied');
    console.log(JSON.stringify({ login: 'verified', anonymous: anonymous.status, administrator: allowed, verifiedOutsideDomain: denied.status }));
  } finally {
    try { if (temporaryUid) await admin.deleteUser(temporaryUid); }
    finally { await deleteApp(app); }
  }
}
