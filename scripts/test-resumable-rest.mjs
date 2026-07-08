#!/usr/bin/env node
import { config } from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

config({ path: '.env.local' });
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const custom = await getAuth().createCustomToken('podcast-resumable-rest');
const sign = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  }
);
const { idToken } = await sign.json();
const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const path = 'podcasts/incoming/resumable-rest-test/audio.m4a';
const name = encodeURIComponent(path);

const start = await fetch(
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${name}&uploadType=resumable`,
  {
    method: 'POST',
    headers: {
      Authorization: `Firebase ${idToken}`,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Type': 'audio/mp4',
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ name: path, contentType: 'audio/mp4' }),
  }
);
console.log('start resumable', start.status, start.statusText);
if (!start.ok) {
  console.log(await start.text());
  process.exit(1);
}
const sessionUrl = start.headers.get('x-goog-upload-url');
console.log('session', sessionUrl?.slice(0, 80));

const bytes = Buffer.alloc(4096, 1);
const upload = await fetch(sessionUrl, {
  method: 'POST',
  headers: {
    'X-Goog-Upload-Command': 'upload, finalize',
    'X-Goog-Upload-Offset': '0',
    'Content-Type': 'audio/mp4',
  },
  body: bytes,
});
console.log('finalize', upload.status);
if (!upload.ok) console.log(await upload.text());
else console.log('OK resumable REST upload');
