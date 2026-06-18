#!/usr/bin/env node
/**
 * E2E smoke test: validate → upload-url → Firebase Storage upload (auth rules).
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const TEST_UID = 'podcast-e2e-test';

function initAdmin() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

async function getIdToken() {
  const auth = getAuth(initAdmin());
  const customToken = await auth.createCustomToken(TEST_UID);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`signInWithCustomToken: ${JSON.stringify(data)}`);
  return data.idToken;
}

async function findArticleSlug() {
  const db = getFirestore(initAdmin());
  const snap = await db.collection('articles').limit(5).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const slug = data.slug || doc.id;
    const title = data.name || data.title;
    if (slug && title) return { slug, title, url: `https://www.aproposmagazine.com/articles/${slug}` };
  }
  return {
    slug: '28-years-later-biograf-zombie-trilogiens-ambitiose-filosofiske-finale',
    title: 'Test artikel',
    url: 'https://www.aproposmagazine.com/articles/28-years-later-biograf-zombie-trilogiens-ambitiose-filosofiske-finale',
  };
}

async function api(path, idToken, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function uploadToStorage(storagePath, idToken, bytes) {
  const name = encodeURIComponent(storagePath);
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${name}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${idToken}`,
        'Content-Type': 'audio/mp4',
      },
      body: bytes,
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Storage upload ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function main() {
  console.log('1) Henter Firebase ID token…');
  const idToken = await getIdToken();

  const article = await findArticleSlug();
  console.log(`2) Validerer artikel: ${article.url}`);

  const validate = await api('/api/podcast/validate', idToken, { articleUrl: article.url });
  if (validate.status !== 200 || !validate.json.ok) {
    throw new Error(`validate fejlede (${validate.status}): ${JSON.stringify(validate.json)}`);
  }
  console.log('   OK —', validate.json.title);

  const slug = validate.json.slug;
  const tmp = join(root, 'scripts', '.podcast-test-audio.m4a');
  const bytes = Buffer.alloc(4096, 0);
  writeFileSync(tmp, bytes);

  console.log('3) Henter upload-path…');
  const uploadUrl = await api('/api/podcast/upload-url', idToken, {
    slug,
    contentType: 'audio/mp4',
    sizeBytes: bytes.length,
    fileExtension: '.m4a',
  });
  if (uploadUrl.status !== 200 || !uploadUrl.json.ok) {
    throw new Error(`upload-url fejlede (${uploadUrl.status}): ${JSON.stringify(uploadUrl.json)}`);
  }
  const storagePath = uploadUrl.json.storagePath;
  console.log('   path:', storagePath);

  console.log('4) Uploader til Firebase Storage (auth rules)…');
  const stored = await uploadToStorage(storagePath, idToken, bytes);
  console.log('   OK —', stored.name);

  console.log('\nAlle trin bestået. Storage rules virker med indlogget bruger.');
}

main()
  .catch((err) => {
    console.error('\nFEJL:', err.message || err);
    process.exit(1);
  })
  .finally(() => {
    try {
      unlinkSync(join(root, 'scripts', '.podcast-test-audio.m4a'));
    } catch {
      /* ignore */
    }
  });
