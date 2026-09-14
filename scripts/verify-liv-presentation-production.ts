import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';
import { loadProductionEnv, productionOrigin, vercelRequest } from './liv-production-access';

// Read-only production acceptance; malformed mutation probes stop at validation.
// Never calls a valid POST/DELETE, preparation, model or publication operation.
let phase = 'release';
async function main() {
  assert(process.argv.includes('--execute'));
  const release = await vercelRequest('/v13/deployments/dpl_DSx7t5ooSSBeaR4RvcHMHavNZUHZ');
  assert.equal(release.readyState, 'READY');
  assert.equal(release.meta?.githubCommitSha, '3e0609221a00dec20c5c7e9e4e862f25fc0cc0de');
  assert(release.alias?.includes('ai.aproposmagazine.com'));
  phase = 'authentication';
  await loadProductionEnv(['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY']);
  const admin = getAdminAuth(); assert(admin);
  const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
  assert(owner.emailVerified && !owner.disabled);
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, 'liv-presentation-3e06092');
  const auth = getAuth(app);
  try {
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid));
    const token = await signed.user.getIdToken();
    const request = (path: string, method = 'GET', authenticated = true) => fetch(productionOrigin + path, {
      method, headers: { ...(authenticated ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: '{}' }), redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    const path = '/api/liv/revisions/presentation';
    phase = 'anonymous-denial';
    for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await request(path, method, false)).status, 401);
    phase = 'validation';
    for (const method of ['POST', 'DELETE']) {
      const response = await request(path, method);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
    phase = 'feed';
    const feedResponse = await request('/api/liv/delivery/feed'); assert.equal(feedResponse.status, 200);
    const feed = await feedResponse.json();
    const story = feed.stories.find((row: any) => row.state === 'ready' && row.decision !== 'rejected');
    assert(story, 'no_ready_story');
    phase = 'baseline';
    const response = await request(`${path}?itemId=${story.itemId}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const baseline = await response.json();
    assert.deepEqual(Object.keys(baseline).sort(), ['itemId', 'expectedPayloadHash', 'expectedCmsHash', 'title', 'seoTitle', 'seoDescription'].sort());
    assert.equal(baseline.itemId, story.itemId); assert.equal(baseline.expectedPayloadHash, story.payloadHash);
    assert(/^[a-f0-9]{64}$/.test(baseline.expectedCmsHash));
    console.log(JSON.stringify({ deployment: release.id, sha: release.meta.githubCommitSha,
      anonymousDenied: ['GET', 'POST', 'DELETE'], invalidMutationsRejected: true,
      baselineStatus: response.status, itemId: story.itemId, title: baseline.title,
      queueEnabled: feed.queueEnabled, preparationEnabled: feed.preparationEnabled, publishedByTest: false }));
  } finally { await signOut(auth); await deleteApp(app); }
}
main().catch(() => { console.error(JSON.stringify({ acceptance: 'incomplete', phase, automaticRetry: false })); process.exitCode = 1; });
