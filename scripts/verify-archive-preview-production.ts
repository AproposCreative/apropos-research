import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth } from '../lib/firebase-admin';
import { loadProductionEnv, productionOrigin, vercelRequest } from './liv-production-access';

// Creates one expiring, unapplied preview only. No model, CMS mutation or publish.
let phase = 'release';
async function main() {
  assert(process.argv.includes('--execute'), 'explicit_execute_required');
  const release = await vercelRequest('/v13/deployments/dpl_Gn92pBgqm5pQfLKkHxNaZcdLmgKT');
  assert.equal(release.readyState, 'READY');
  assert.equal(release.meta?.githubCommitSha, '613d3abb042e229264eb91925fbab157dd867961');
  assert(release.alias?.includes('ai.aproposmagazine.com'));
  phase = 'authentication';
  await loadProductionEnv(['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL',
    'FIREBASE_ADMIN_PRIVATE_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'WEBFLOW_API_TOKEN', 'WEBFLOW_ARTICLES_COLLECTION_ID']);
  const admin = getAdminAuth(); assert(admin);
  const user = await admin.getUserByEmail('frederik@aproposmagazine.com');
  assert(user.emailVerified && !user.disabled);
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, 'archive-preview-613d3ab');
  const auth = getAuth(app);
  const itemId = '6aa25ad86a1d9776ca18ee12';
  const path = '/api/seo-engine/archive-audit/content-preview';
  const snapshot = async () => {
    const url = `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_ARTICLES_COLLECTION_ID}/items/${itemId}?cmsLocaleId=67dbf17ba540975b5b21c225`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}` },
      redirect: 'error', signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200);
    const item = await response.json();
    assert.equal(item.id, itemId); assert(item.lastPublished && !item.isDraft && !item.isArchived);
    return createHash('sha256').update(JSON.stringify({ fields: item.fieldData, lastUpdated: item.lastUpdated,
      lastPublished: item.lastPublished, isDraft: item.isDraft })).digest('hex');
  };
  try {
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(user.uid));
    const token = await signed.user.getIdToken();
    const body = JSON.stringify({ selection: [{ itemId, locale: 'da' }], kinds: ['internal_links'] });
    phase = 'anonymous-denial';
    const anonymous = await fetch(productionOrigin + path, { method: 'POST', body,
      headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    assert([401, 403].includes(anonymous.status));
    phase = 'cms-before';
    const before = await snapshot();
    phase = 'preview-request';
    const response = await fetch(productionOrigin + path, { method: 'POST', body,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(300_000) });
    const result = await response.json();
    console.log(JSON.stringify({ status: response.status, anonymousStatus: anonymous.status,
      previewId: result.previewId, stoppedOnError: result.stoppedOnError, proposals: result.proposalCount,
      rejected: result.rejectedCount, proposedLinks: result.proposals?.reduce((n: number, p: any) => n + (p.links?.length || 0), 0) }));
    assert.equal(response.status, 200); assert.equal(result.ok, true); assert.equal(result.stoppedOnError, false);
    phase = 'cms-after';
    assert.equal(await snapshot(), before);
    console.log(JSON.stringify({ cmsUnchanged: true, previewApplied: false, itemId }));
  } finally { await signOut(auth); await deleteApp(app); }
}
main().catch(() => { console.error(JSON.stringify({ acceptance: 'incomplete', phase, automaticRetry: false, applied: false })); process.exitCode = 1; });
