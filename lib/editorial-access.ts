import { getAdminAuth, getAdminDb } from './firebase-admin';
import { editorialRole, normalizeAccessEmail, type AccessEntry, type EditorialRole } from './auth-policy';
import { OWNER_EMAIL } from './editorial-capabilities';

export const EDITORIAL_ACCESS_COLLECTION = 'editorialAccess';

/** No positive cache: removing access must also affect existing sessions. */
export async function verifyEditorialToken(token: string): Promise<{ uid: string; role: EditorialRole; owner: boolean } | null> {
  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) return null;
  try {
    const claims = await auth.verifyIdToken(token, true);
    const user = await auth.getUser(claims.uid);
    const email = normalizeAccessEmail(user.email);
    if (!email) return null;
    const snapshot = await db.collection(EDITORIAL_ACCESS_COLLECTION).doc(email).get();
    const role = editorialRole({ email, emailVerified: user.emailVerified,
      disabled: user.disabled, entry: snapshot.exists ? snapshot.data() as AccessEntry : null });
    return role ? { uid: user.uid, role, owner: email === OWNER_EMAIL } : null;
  } catch { return null; }
}
