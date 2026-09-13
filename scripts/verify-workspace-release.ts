import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';

/** Read-only live smoke check; never logs private workspace contents or tokens. */
export async function verifyWorkspaceRelease() {
  const admin = getAdminAuth(); if (!admin) throw new Error('admin_missing');
  const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
  if (!owner.emailVerified || owner.disabled) throw new Error('owner_not_verified');
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `workspace-release-${randomUUID()}`);
  const auth = getAuth(app);
  const origin = 'https://ai.aproposmagazine.com';
  try {
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid));
    const token = await signed.user.getIdToken();
    const paths = ['/api/auth/access', '/api/writer/workspace', '/api/writer/workspace/versions',
      '/api/liv/media-sources', '/api/editorial/tips', '/api/liv/delivery/feed'];
    for (const path of paths) {
      const response = await fetch(`${origin}${path}`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`read_failed:${path}:${response.status}`);
      const data = await response.json();
      if (path === '/api/auth/access' && data.capabilities?.owner !== true) throw new Error('owner_capability_missing');
      if (path === '/api/liv/media-sources' && !data.sources?.some((s: any) => s.name === 'Soundvenue' && s.enabled)) throw new Error('shared_source_missing');
      console.log(JSON.stringify({ path, status: response.status, cache: response.headers.get('cache-control'),
        ...(path === '/api/liv/delivery/feed' ? { queueEnabled: data.queueEnabled, preparationEnabled: data.preparationEnabled, stories: data.stories?.length } : {}) }));
    }
    for (const path of ['/api/writer/workspace', '/api/liv/media-sources', '/api/editorial/tips']) {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (![401, 403].includes(response.status)) throw new Error(`anonymous_access_unexpected:${path}:${response.status}`);
      console.log(JSON.stringify({ case: 'anonymous-denied', path, status: response.status }));
    }
  } finally { await signOut(auth); await deleteApp(app); }
}
