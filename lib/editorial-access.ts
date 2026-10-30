import { getAdminAuth, getAdminDb } from './firebase-admin';
import { editorialRole, normalizeAccessEmail, type AccessEntry, type EditorialRole } from './auth-policy';
import { OWNER_EMAIL, isEditorialOwnerEmail } from './editorial-capabilities';

export const EDITORIAL_ACCESS_COLLECTION = 'editorialAccess';

/** An owner alias inherits the existing owner's role, but suspension of either
 * address blocks it. Keep each Firebase UID and its saved work unchanged. */
export async function readEditorialAccessEntry(email: string): Promise<AccessEntry | undefined> {
  const db = getAdminDb();
  if (!db) throw Error('editorial_access_unavailable');
  const canonical = isEditorialOwnerEmail(email) ? OWNER_EMAIL : email;
  const [identityDoc, ownerDoc] = await Promise.all([
    db.collection(EDITORIAL_ACCESS_COLLECTION).doc(email).get(),
    canonical !== email ? db.collection(EDITORIAL_ACCESS_COLLECTION).doc(canonical).get() : Promise.resolve(null),
  ]);
  const identity = identityDoc.exists ? identityDoc.data() as AccessEntry : undefined;
  const owner = ownerDoc?.exists ? ownerDoc.data() as AccessEntry : undefined;
  if (identity?.active === false || owner?.active === false) return { active: false, role: 'editor' };
  return owner ?? identity;
}

/** Resolve identity from a verified bearer token, never a client supplied UID. */
export async function editorialRequestAccess(request: Request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? verifyEditorialToken(header.slice(7)) : null;
}

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
    const entry = await readEditorialAccessEntry(email);
    const role = editorialRole({ email, emailVerified: user.emailVerified,
      disabled: user.disabled, entry });
    return role ? { uid: user.uid, role, owner: isEditorialOwnerEmail(email) } : null;
  } catch { return null; }
}
