import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { sameCmsBody } from '../lib/articles/cms-body-equivalence';
import { loadProductionEnv, vercelRequest, productionOrigin } from './liv-production-access';

// Explicit, one-off acceptance operation. No automatic retries, AI generation,
// publication, real-workspace overwrite or deletion of audit records.
const draftId = 'acceptance-writer-cms-19922f2';
const title = 'TEKNISK TEST: Writer API kladde, må ikke publiceres';
const slug = 'teknisk-test-writer-api-19922f2';
const content = '<p>Dette er en teknisk testkladde, ikke en redaktionel artikel.</p><h2>Gem og genprøv</h2><p>Samme kladde skal beholde sit CMS-ID. Æ, ø og å skal bevares.</p>';

async function main() {
  assert(process.argv.includes('--execute'), 'explicit_execute_required');
  const release = await vercelRequest('/v13/deployments/dpl_86aWmEKESVBuqiG433eStfnX8Kra');
  assert.equal(release.readyState, 'READY');
  assert.equal(release.meta?.githubCommitSha, '19922f21cfb18572e9ad4cb33dd9912b7558f9e4');
  assert(release.alias?.includes('ai.aproposmagazine.com'));
  await loadProductionEnv(['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL',
    'FIREBASE_ADMIN_PRIVATE_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'WEBFLOW_API_TOKEN', 'WEBFLOW_ARTICLES_COLLECTION_ID']);
  const admin = getAdminAuth(); const db = getAdminDb(); assert(admin && db);
  const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
  assert(owner.emailVerified && !owner.disabled);
  const journal = db.collection('writerWorkspaces').doc(owner.uid).collection('cmsSaves').doc(draftId);
  assert(!(await journal.get()).exists, 'existing_attempt_requires_inspection_not_new_test');
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, draftId);
  const auth = getAuth(app);
  let itemId: string | undefined;
  let firstId: string | undefined;
  const cms = async (id: string, init: RequestInit = {}) => {
    assert(/^[a-f0-9]{24}$/i.test(id));
    const url = `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_ARTICLES_COLLECTION_ID}/items/${id}`;
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}`, 'Content-Type': 'application/json' } });
    assert(response.ok, `cms_http_${response.status}`);
    return response.json();
  };
  const checkedTestItem = async (id: string) => {
    const item = await cms(id);
    assert.equal(item.id, id); assert.equal(item.fieldData?.name, title); assert.equal(item.fieldData?.slug, slug);
    assert.equal(item.isDraft, true); assert(!item.lastPublished, 'test_unexpectedly_published');
    return item;
  };
  try {
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid));
    const token = await signed.user.getIdToken();
    const body = JSON.stringify({ draftId, article: { title, slug, content, source: 'manual', status: 'draft',
      seoTitle: title, seoDescription: 'Teknisk privat test. Må ikke publiceres.', aiGenerated: false } });
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await fetch(`${productionOrigin}/api/writer/cms-save`, { method: 'POST', body,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(300_000) });
      const result = await response.json();
      const record = (await journal.get()).data();
      itemId = record?.articleId;
      console.log(JSON.stringify({ attempt, status: response.status, articleId: itemId, phase: record?.phase,
        saveVerified: result.data?.saveVerified, cache: response.headers.get('cache-control') }));
      assert.equal(response.status, 200); assert(itemId); assert.equal(result.data?.articleId, itemId);
      assert.equal(result.data?.saveVerified, true); assert.equal(result.data?.publicationVerified, false);
      assert.equal(record?.phase, 'saved');
      const item = await checkedTestItem(itemId);
      assert(sameCmsBody(content, item.fieldData.content));
      assert.equal(record?.beforeIds?.includes(itemId), false);
      if (attempt === 1) firstId = itemId;
      else assert.equal(itemId, firstId);
    }
    console.log(JSON.stringify({ acceptance: 'same-operation-replay-passed', articleId: itemId }));
  } finally {
    // Exact test identity AND unpublished draft are mandatory before archival.
    itemId ||= (await journal.get()).data()?.articleId;
    try {
      if (itemId) {
        await checkedTestItem(itemId);
        await cms(itemId, { method: 'PATCH', body: JSON.stringify({ isDraft: true, isArchived: true }) });
        const archived = await checkedTestItem(itemId); assert.equal(archived.isArchived, true);
        console.log(JSON.stringify({ cleanup: 'archived-recoverable', articleId: itemId, auditRetained: true }));
      }
    } finally { await signOut(auth); await deleteApp(app); }
  }
}
main().catch(() => { console.error('Writer CMS acceptance incomplete. Inspect retained journal before any retry.'); process.exitCode = 1; });
