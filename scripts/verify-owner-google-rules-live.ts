import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, deleteObject } from 'firebase/storage';
import { getAdminAuth, getAdminDb, getAdminStorageBucket } from '../lib/firebase-admin';
import { OWNER_LOGIN_EMAILS } from '../lib/editorial-capabilities';

/** Existing approved identities only. No account creation, merging, role writes,
 * mail, OAuth consent or publication. In-memory custom-token test sessions are
 * not Google-browser login and never establish personal editorial approval. */
export async function verifyOwnerGoogleRulesLive(origin?: string) {
  if (origin && origin !== 'https://ai.aproposmagazine.com') throw Error('unexpected_verification_origin');
  const admin = getAdminAuth(); if (!admin) throw Error('verification_admin_unavailable');
  const reports: Array<Record<string, unknown>> = [];
  for (const [index, email] of OWNER_LOGIN_EMAILS.entries()) {
    const user = await admin.getUserByEmail(email);
    if (!user.emailVerified || user.disabled) throw Error('approved_account_not_verified');
    const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }, `owner-login-verification-${randomUUID()}`);
    const auth = getAuth(app), database = getFirestore(app), storage = getStorage(app);
    const probe = `login-verification-${randomUUID()}`, draft = doc(database, 'drafts', probe);
    const image = ref(storage, `article-imports/${user.uid}/${probe}.png`);
    let draftCreated = false, imageCreated = false;
    let stage = 'session';
    try {
      await signInWithCustomToken(auth, await admin.createCustomToken(user.uid));
      // These are the actual Firebase client rules, not privileged Admin writes.
      stage = 'own-draft-create';
      await setDoc(draft, { userId: user.uid, verification: true }); draftCreated = true;
      stage = 'own-draft-read';
      if (!(await getDoc(draft)).exists()) throw Error('draft_probe_readback_failed');
      stage = 'own-storage-upload';
      await uploadBytes(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=', 'base64'), { contentType: 'image/png' }); imageCreated = true;
      stage = 'reject-owner-transfer';
      let ownerTransferDenied = false;
      try { await setDoc(draft, { userId: 'not-this-account', verification: true }); }
      catch (error) { if ((error as { code?: string }).code !== 'permission-denied') throw error; ownerTransferDenied = true; }
      if (!ownerTransferDenied) throw Error('draft_owner_transfer_not_denied');
      stage = 'reject-private-access-list';
      let accessListDenied = false;
      try { await getDoc(doc(database, 'editorialAccess', email)); }
      catch (error) { if ((error as { code?: string }).code !== 'permission-denied') throw error; accessListDenied = true; }
      if (!accessListDenied) throw Error('access_list_not_private');
      const api: Array<Record<string, unknown>> = [];
      if (origin) {
        const token = await auth.currentUser!.getIdToken();
        for (const path of ['/api/auth/access', '/oauth/access', '/api/editorial/tools']) {
          const response = await fetch(origin + path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
          const data = await response.json();
          if (response.status !== 200) throw Error('approved_owner_api_denied:' + path);
          if (path.endsWith('/access') && (data.allowed !== true || data.capabilities?.owner !== true)) throw Error('owner_capability_missing:' + path);
          if (path.endsWith('/tools') && !Array.isArray(data.tools)) throw Error('tool_catalogue_missing');
          api.push({ path, status: response.status });
        }
      }
      stage = 'cleanup';
      await deleteObject(image); imageCreated = false;
      await deleteDoc(draft); draftCreated = false;
      await signOut(auth);
      reports.push({ account: index === 0 ? 'editorial-owner' : index === 1 ? 'approved-gmail' : 'approved-creative',
        draftReadWrite: true, storageUploadDelete: true, ownerTransferDenied, accessListDenied, artifactsRemoved: true, api });
    } catch (error) {
      throw Error(`owner_login_verification_failed:account-${index}:${stage}:${(error as {code?:string}).code || 'check_failed'}`);
    } finally {
      try {
        // Admin cleanup is confined to this randomly named probe if client rules fail.
        if (imageCreated) await getAdminStorageBucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).file(image.fullPath).delete({ ignoreNotFound: true });
        if (draftCreated) await getAdminDb()!.collection('drafts').doc(probe).delete();
      } finally { await deleteApp(app); }
    }
  }
  return { checkedAt: new Date().toISOString(), reports, browserGoogleSignInSimulated: false, testTransport: 'in-memory Firebase custom-token sessions', existingIdentitiesPreserved: true };
}
