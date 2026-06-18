#!/usr/bin/env node
/**
 * Deploy storage.rules via Firebase Rules API + service account fra .env.local
 * (undgår interaktiv `firebase login --reauth`).
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { config } from 'dotenv';
import { GoogleAuth } from 'google-auth-library';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
const bucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  `${projectId}.appspot.com`;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Manglende FIREBASE_ADMIN_* i .env.local');
  process.exit(1);
}

const credPath = join(tmpdir(), `firebase-sa-${Date.now()}.json`);
writeFileSync(
  credPath,
  JSON.stringify({
    type: 'service_account',
    project_id: projectId,
    private_key: privateKey,
    client_email: clientEmail,
    token_uri: 'https://oauth2.googleapis.com/token',
  })
);

const auth = new GoogleAuth({
  credentials: JSON.parse(readFileSync(credPath, 'utf8')),
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function api(path, init = {}) {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

async function main() {
  const rulesContent = readFileSync(join(root, 'storage.rules'), 'utf8');

  console.log(`Deployer storage rules til ${projectId} (bucket: ${bucket})…`);

  const ruleset = await api(`projects/${projectId}/rulesets`, {
    method: 'POST',
    body: JSON.stringify({
      source: {
        files: [{ name: 'storage.rules', content: rulesContent }],
      },
    }),
  });

  const rulesetName = ruleset.name;
  if (!rulesetName) throw new Error('Ingen ruleset name i svar');

  const releaseName = `projects/${projectId}/releases/firebase.storage/${bucket}`;

  // Bucket'en har allerede en live release → opdater den (PATCH). Falder tilbage
  // til POST (opret) hvis release ikke findes endnu.
  let release;
  try {
    release = await api(`${releaseName}?updateMask=rulesetName`, {
      method: 'PATCH',
      body: JSON.stringify({
        release: { name: releaseName, rulesetName },
      }),
    });
  } catch (patchErr) {
    console.warn('PATCH af release fejlede, forsøger POST (opret)…');
    console.warn(`  ${patchErr.message || patchErr}`);
    release = await api(`projects/${projectId}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        name: releaseName,
        rulesetName,
      }),
    });
  }

  console.log('OK — storage rules deployet');
  console.log('  ruleset:', rulesetName);
  console.log('  release:', release.name || `firebase.storage/${bucket}`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  })
  .finally(() => {
    try {
      unlinkSync(credPath);
    } catch {
      /* ignore */
    }
  });
