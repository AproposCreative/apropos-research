import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';
import { loadProductionEnv, productionOrigin, vercelRequest } from './liv-production-access';

// Read-only release/access checks. Never submits a valid generation/review/save.
let phase = 'release';
async function main() {
  const [deploymentId, sha] = process.argv.slice(2);
  assert(/^dpl_[a-zA-Z0-9]+$/.test(deploymentId || ''));
  assert(/^[a-f0-9]{40}$/.test(sha || ''));
  const release = await vercelRequest(`/v13/deployments/${deploymentId}`);
  assert.equal(release.readyState, 'READY'); assert.equal(release.meta?.githubCommitSha, sha);
  assert.equal((await vercelRequest('/v4/aliases/ai.aproposmagazine.com')).deployment?.id, deploymentId);
  phase = 'authentication';
  await loadProductionEnv(['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY']);
  const admin = getAdminAuth(); assert(admin);
  const owner = await admin.getUserByEmail('frederik@aproposmagazine.com'); assert(owner.emailVerified && !owner.disabled);
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `shortening-${deploymentId}`);
  const auth = getAuth(app);
  try {
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid));
    const token = await signed.user.getIdToken();
    const request = (path: string, method = 'GET', authenticated = true) => fetch(productionOrigin + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { ...(authenticated ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    phase = 'access';
    const endpoint = '/api/liv/revisions/shortening';
    for (const suffix of ['', '/review', '/accept']) {
      assert.equal((await request(endpoint + suffix, 'POST', false)).status, 401);
      const invalid = await request(endpoint + suffix, 'POST'); assert.equal(invalid.status, 400);
      assert.equal(invalid.headers.get('cache-control'), 'private, no-store');
    }
    assert.equal((await request(endpoint + '?itemId=' + 'a'.repeat(24), 'GET', false)).status, 401);
    phase = 'feed';
    const feedResponse = await request('/api/liv/delivery/feed'); assert.equal(feedResponse.status, 200);
    const feed = await feedResponse.json();
    const ready = feed.stories.find((story: any) => story.state === 'ready' && story.decision !== 'rejected');
    let baseline: unknown = null;
    if (ready) {
      phase = 'baseline';
      const response = await request(`${endpoint}?itemId=${ready.itemId}`);
      const data = await response.json();
      // Eligibility may change with the scheduled publication; report it, not success by assumption.
      assert([200, 409].includes(response.status));
      baseline = { status: response.status, itemId: ready.itemId,
        ...(response.status === 200 ? { wordCount: data.wordCount, minTargetWords: data.minTargetWords, maxTargetWords: data.maxTargetWords } : { error: data.error }) };
      if (response.status === 200) { assert.equal(data.itemId, ready.itemId); assert.equal(data.expectedPayloadHash, ready.payloadHash); }
    }
    phase = 'operations';
    const response = await request('/api/editorial/operations'); assert.equal(response.status, 200);
    const operations = await response.json();
    console.log(JSON.stringify({ deploymentId, sha, currentAliasVerified: true, anonymousDenied: true,
      invalidMutationsRejected: true, baseline, dailyOperation: operations.liv,
      checkedAt: operations.checkedAt, articleChanged: false, modelCalled: false, publishedByTest: false }));
  } finally { await signOut(auth); await deleteApp(app); }
}
main().catch(() => { console.error(JSON.stringify({ verification: 'incomplete', phase })); process.exitCode = 1; });
