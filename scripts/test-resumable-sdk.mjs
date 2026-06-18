#!/usr/bin/env node
/**
 * Simulerer browser uploadBytesResumable med Firebase client SDK.
 */
import { config } from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp as initClientApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { readFileSync } from 'fs';

config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const customToken = await getAdminAuth().createCustomToken('podcast-resumable-sdk-test');

const clientApp = initClientApp({
  apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId,
  storageBucket: bucket,
});
const auth = getAuth(clientApp);
await signInWithCustomToken(auth, customToken);
await auth.currentUser.getIdToken(true);

const storage = getStorage(clientApp, `gs://${bucket}`);
const slug = '28-years-later-biograf-zombie-trilogiens-ambitiose-filosofiske-finale';
const storagePath = `podcasts/incoming/${slug}/audio.m4a`;
const bytes = readFileSync('/dev/zero').subarray(0, 8192);
const file = new Blob([bytes], { type: 'audio/mp4' });
file.name = 'audio.m4a';

console.log('uploadBytesResumable →', storagePath, 'bucket', bucket);

try {
  const task = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: 'audio/mp4',
  });
  await new Promise((resolve, reject) => {
    task.on('state_changed', null, reject, resolve);
  });
  console.log('OK resumable upload');
} catch (e) {
  console.error('FEJL', e.code, e.message);
  process.exit(1);
}
