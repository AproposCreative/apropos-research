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
    const failures: string[] = [];
    const paths = ['/api/auth/access', '/api/writer/workspace', '/api/writer/workspace/versions', '/api/writer/workspace/shares',
      '/api/liv/media-sources', '/api/editorial/tips', '/api/liv/delivery/feed', '/api/editorial/operations', '/api/editorial/operations/alerts'];
    for (const path of paths) {
      try {
      const response = await fetch(`${origin}${path}`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`read_failed:${path}:${response.status}`);
      const data = await response.json();
      if (path === '/api/auth/access' && data.capabilities?.owner !== true) throw new Error('owner_capability_missing');
      if (path === '/api/liv/media-sources' && !data.sources?.some((s: any) => s.name === 'Soundvenue' && s.enabled)) throw new Error('shared_source_missing');
      if (path === '/api/editorial/operations' && (!data.liv?.available || !data.alerts?.available)) throw new Error('operations_unavailable');
      if (path === '/api/editorial/operations/alerts' && !Array.isArray(data.records)) throw new Error('alert_history_invalid');
      console.log(JSON.stringify({ path, status: response.status, cache: response.headers.get('cache-control'),
        ...(path === '/api/liv/delivery/feed' ? { queueEnabled: data.queueEnabled, preparationEnabled: data.preparationEnabled, stories: data.stories?.length } : {}) }));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `read_failed:${path}`);
      }
    }
    for (const path of ['/api/writer/workspace', '/api/writer/workspace/shares', '/api/liv/media-sources', '/api/editorial/tips', '/api/editorial/operations', '/api/editorial/operations/alerts']) {
      try {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (![401, 403].includes(response.status)) throw new Error(`anonymous_access_unexpected:${path}:${response.status}`);
      console.log(JSON.stringify({ case: 'anonymous-denied', path, status: response.status }));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `anonymous_check_failed:${path}`);
      }
    }
    // Empty body is invalid even on the former endpoint, so this check cannot
    // create a share when pointed at an older deployment.
    const retired = await fetch(`${origin}/api/writer/workspace/shares`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}', redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (retired.status !== 410 || retired.headers.get('cache-control') !== 'private, no-store') {
      failures.push(`share_retirement_unconfirmed:${retired.status}`);
    } else console.log(JSON.stringify({ case: 'new-sharing-retired', status: retired.status }));
    if (failures.length) throw new Error(`release_checks_failed:${failures.join(';')}`);
  } finally { await signOut(auth); await deleteApp(app); }
}
