import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getStorage, ref, uploadBytes, deleteObject } from 'firebase/storage';
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { getAdminAuth } from '../lib/firebase-admin';

/** Real Firebase client requests, not Admin SDK data writes. Only UUID-tagged
 * verification artifacts are created and removed. No provider/model/CMS calls.
 */
export async function verifyEditorialRulesLive() {
  const uid = process.env.SEO_ENGINE_ADMIN_UIDS?.split(',')[0]?.trim();
  const admin = getAdminAuth();
  if (!uid || !admin) throw new Error('live_rules_admin_missing');
  const user = await admin.getUser(uid);
  if (!user.emailVerified || user.disabled) throw new Error('live_rules_admin_invalid');
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }, `rules-verification-${randomUUID()}`);
  const auth = getAuth(app);
  const db = getFirestore(app), storage = getStorage(app);
  const id = `rules-verification-${randomUUID()}`;
  const draft = doc(db, 'drafts', id);
  const asset = ref(storage, `article-imports/${uid}/${id}.png`);
  let draftCreated = false, assetCreated = false;
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=', 'base64');
  async function denied(run: () => Promise<unknown>) {
    try { await run(); } catch (error) {
      if (['permission-denied', 'storage/unauthorized'].includes((error as {code?: string}).code || '')) return;
      throw new Error('live_rules_denial_unexpected_error');
    }
    throw new Error('live_rules_expected_denial');
  }
  try {
    await signInWithCustomToken(auth, await admin.createCustomToken(uid));
    await setDoc(draft, { userId: uid, verification: true }); draftCreated = true;
    if (!(await getDoc(draft)).exists()) throw new Error('live_rules_draft_readback_failed');
    await uploadBytes(asset, bytes, { contentType: 'image/png' }); assetCreated = true;
    await denied(() => setDoc(draft, { userId: 'not-the-owner', verification: true }));
    await denied(() => getDoc(doc(db, 'editorialAccess', user.email!.toLowerCase())));
    await deleteObject(asset); assetCreated = false;
    await deleteDoc(draft); draftCreated = false;
    await signOut(auth);
    await denied(() => uploadBytes(asset, bytes, { contentType: 'image/png' }));
    await denied(() => setDoc(draft, { userId: uid, verification: true }));
    console.log(JSON.stringify({ liveRules: 'verified', checks: ['allowlisted-admin-draft-write-read', 'storage-cross-service-upload-delete', 'owner-transfer-denied', 'access-list-client-read-denied', 'unsigned-storage-denied', 'unsigned-draft-denied'], artifactsRemoved: true }));
  } finally {
    // Cleanup failure remains an error; never silently leave verification data.
    try {
      if (assetCreated) await deleteObject(asset);
      if (draftCreated) await deleteDoc(draft);
    } finally { await deleteApp(app); }
  }
}
