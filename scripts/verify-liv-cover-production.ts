import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';
import { loadProductionEnv, productionOrigin, vercelRequest } from './liv-production-access';

// No valid mutation, source download, image review, preparation or publication.
let phase = 'release';
async function main() {
  assert(process.argv.includes('--execute'));
  const release = await vercelRequest('/v13/deployments/dpl_8Rydiv5XY4pURawQUcxVGtidLpTt');
  assert.equal(release.readyState, 'READY');
  assert.equal(release.meta?.githubCommitSha, '6b5d3eef61cfa2112f99af3a452dfaadfff24796');
  assert(release.alias?.includes('ai.aproposmagazine.com'));
  // Confirm the current domain points to this release, not just a historical alias.
  const alias = await vercelRequest('/v4/aliases/ai.aproposmagazine.com');
  assert.equal(alias.deployment?.id, release.id);
  phase = 'authentication';
  await loadProductionEnv(['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY']);
  const admin = getAdminAuth(); assert(admin);
  const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
  assert(owner.emailVerified && !owner.disabled);
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, 'liv-cover-6b5d3ee');
  const auth = getAuth(app);
  try {
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid));
    const token = await signed.user.getIdToken();
    const request = (path: string, method = 'GET', authenticated = true) => fetch(productionOrigin + path, {
      method, headers: { ...(authenticated ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: '{}' }), redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    const path = '/api/liv/revisions/cover';
    phase = 'anonymous-denial';
    for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await request(path, method, false)).status, 401);
    phase = 'validation';
    for (const method of ['POST', 'DELETE']) {
      const response = await request(path, method);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
    phase = 'feed';
    const response = await request('/api/liv/delivery/feed'); assert.equal(response.status, 200);
    const feed = await response.json();
    const story = feed.stories.find((row: any) => row.state === 'ready' && row.decision !== 'rejected');
    assert(story, 'no_ready_story');
    phase = 'baseline';
    const baselineResponse = await request(`${path}?itemId=${story.itemId}`);
    assert.equal(baselineResponse.status, 200);
    assert.equal(baselineResponse.headers.get('cache-control'), 'private, no-store');
    const baseline = await baselineResponse.json();
    assert.deepEqual(Object.keys(baseline).sort(), ['itemId', 'dayKey', 'title', 'expectedPayloadHash', 'expectedCmsHash'].sort());
    assert.equal(baseline.itemId, story.itemId);
    assert.equal(baseline.dayKey, story.scheduledDay);
    assert.equal(baseline.expectedPayloadHash, story.payloadHash);
    assert(/^[a-f0-9]{64}$/.test(baseline.expectedCmsHash));
    phase = 'daily-operation-status';
    const operationsResponse = await request('/api/editorial/operations');
    assert.equal(operationsResponse.status, 200);
    const operations = await operationsResponse.json();
    console.log(JSON.stringify({ deployment: release.id, sha: release.meta.githubCommitSha,
      currentAliasVerified: true, anonymousDenied: ['GET', 'POST', 'DELETE'], invalidMutationsRejected: true,
      baselineStatus: baselineResponse.status, itemId: story.itemId, title: baseline.title,
      queueEnabled: feed.queueEnabled, preparationEnabled: feed.preparationEnabled,
      dailyOperation: operations.liv, checkedAt: operations.checkedAt,
      coverChangedByTest: false, publishedByTest: false }));
  } finally { await signOut(auth); await deleteApp(app); }
}
main().catch(() => { console.error(JSON.stringify({ acceptance: 'incomplete', phase, automaticRetry: false })); process.exitCode = 1; });
