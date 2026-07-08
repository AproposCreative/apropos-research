#!/usr/bin/env node
/**
 * Giv Firebase Admin SA Viewer på GA4 property via Admin API.
 *
 * BEMÆRK: `gcloud auth application-default login` med analytics-scopes bliver ofte
 * blokeret af Google («This app is blocked») fordi standard OAuth-klienten ikke
 * må bruge sensitive scopes. Brug i stedet den manuelle vej (anbefalet):
 *
 *   GA4 Admin → Property access → Add users
 *   https://analytics.google.com/analytics/web/#/p484743571/admin/property/access
 *   E-mail: firebase-adminsdk-fbsvc@apropos-magazine-6004a.iam.gserviceaccount.com
 *   Rolle: Viewer
 *
 * Scriptet kræver egen OAuth client ID hvis I vil automatisere senere.
 */
import { GoogleAuth } from 'google-auth-library';

const PROPERTY_ID = (process.env.GA4_PROPERTY_ID || '484743571').trim();
const SA_EMAIL =
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() ||
  'firebase-adminsdk-fbsvc@apropos-magazine-6004a.iam.gserviceaccount.com';

const auth = new GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/analytics.edit',
  ],
});

async function api(path, init = {}) {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const res = await fetch(`https://analyticsadmin.googleapis.com/v1beta/${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`Property: ${PROPERTY_ID}`);
  console.log(`Service account: ${SA_EMAIL}`);

  const list = await api(`properties/${PROPERTY_ID}/userLinks`);
  if (list.status === 403) {
    console.error('\nADC mangler analytics-scopes. Kør:');
    console.error(
      '  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform'
    );
    process.exit(1);
  }

  const links = list.body?.userLinks || [];
  const existing = links.find(
    (l) => (l.emailAddress || '').toLowerCase() === SA_EMAIL.toLowerCase()
  );
  if (existing) {
    console.log('SA har allerede adgang:', existing.directRoles || existing);
    return;
  }

  const create = await api(`properties/${PROPERTY_ID}/userLinks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailAddress: SA_EMAIL,
      directRoles: ['predefinedRoles/viewer'],
    }),
  });

  if (create.status >= 200 && create.status < 300) {
    console.log('Viewer tildelt:', create.body);
    return;
  }

  console.error('Kunne ikke tildele Viewer:', create.status, create.body);
  console.error('\nManuelt: GA4 Admin → Property access → Add user →');
  console.error(`  ${SA_EMAIL}  (Viewer)`);
  console.error(
    `  https://analytics.google.com/analytics/web/#/p${PROPERTY_ID}/admin/property/access`
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
