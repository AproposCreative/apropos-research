#!/usr/bin/env node
/**
 * Upload podcast show cover to Firebase Storage:
 *   podcasts/artwork/show-cover.jpg
 *
 * Usage:
 *   node scripts/upload-podcast-artwork.mjs
 *   node scripts/upload-podcast-artwork.mjs --file=public/podcast/show-cover.jpg
 *
 * Requires Firebase Admin credentials (same as the rest of the app).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

try {
  process.loadEnvFile?.(resolve(root, '.env.local'));
} catch {
  /* ignore */
}
try {
  process.loadEnvFile?.(resolve(root, '.env'));
} catch {
  /* ignore */
}

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith('--file='))?.split('=').slice(1).join('=');
const localPath = resolve(root, fileArg || 'public/podcast/show-cover.jpg');
const STORAGE_PATH = 'podcasts/artwork/show-cover.jpg';

if (!existsSync(localPath)) {
  console.error(`Missing cover file: ${localPath}`);
  process.exit(1);
}

function initAdmin() {
  const admin = require('firebase-admin');
  if (admin.apps.length) return admin;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (privateKey?.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Mangler FIREBASE_ADMIN_* credentials');
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  return admin;
}

function bucketName() {
  return (
    process.env.PODCAST_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
    `${process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`
  );
}

const admin = initAdmin();
const bucket = admin.storage().bucket(bucketName());
const buf = readFileSync(localPath);
const file = bucket.file(STORAGE_PATH);

let token = randomUUID();
try {
  const [meta] = await file.getMetadata();
  const raw = meta?.metadata?.firebaseStorageDownloadTokens;
  if (typeof raw === 'string' && raw.trim()) token = raw.split(',')[0].trim();
} catch {
  /* new object */
}

await file.save(buf, {
  resumable: false,
  metadata: {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=86400',
    metadata: { firebaseStorageDownloadTokens: token },
  },
});

const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(STORAGE_PATH)}?alt=media&token=${token}`;
const appUrl = 'https://ai.aproposmagazine.com/podcast/show-cover.jpg';
console.log('Uploaded', STORAGE_PATH);
console.log('Storage URL:', publicUrl);
console.log('App URL (preferred for RSS):', appUrl);
