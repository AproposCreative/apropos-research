/** Explicit service-authenticated release check. Never impersonates a human
 * article approval, mails a colleague, calls a write tool or publishes a fixture.
 * Firebase credentials must be supplied in memory by the approved release host.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { MCP_ORIGIN as origin, MCP_RESOURCE, MCP_VERSION } from '../lib/mcp/config';
import { cmsFieldHash } from '../lib/liv/cms-field-hash';
import { ARTICLE_WIDGET_CSP } from '../lib/mcp/widget-policy';
import { articleWidgetHtml } from '../lib/mcp/article-widget';

assert.equal(process.env.APROPOS_MCP_LAUNCH_VERIFY, 'read-only-service-auth', 'explicit_release_check_required');
const admin = getAdminAuth()!, db = getAdminDb()!;
assert(admin && db, 'existing_service_auth_required');
const submissionId = 'fba542e0dea6eb8b11abb30fd5d651039f8e09f4ddecd711cdbf0ce1fac66d71';
const protectedRef = db.collection('editorialSubmissions').doc(submissionId);
const savedBefore = cmsFieldHash((await protectedRef.get()).data());
async function financial() {
  const [shared, image, holds] = await Promise.all([
    db.collection('livCostLedger').doc('month-2026-10').get(),
    db.collection('imageGenCostLedger').doc('month-2026-10').get(),
    db.collection('aiProviderHolds').limit(10).get(),
  ]);
  return cmsFieldHash({ shared: shared.data() ?? null, image: image.data() ?? null, holds: holds.docs.map(d => d.data()) });
}
const financeBefore = await financial();
const json = async (path: string, init?: RequestInit) => {
  const r = await fetch(origin + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  assert(r.ok, `api_${path.split('?')[0]}_${r.status}`); return r.json();
};
const form = (value: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(value) });
let serial = 0;
async function rpc(access: string, method: string, params: unknown = {}) {
  const r = await fetch(MCP_RESOURCE, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(40_000),
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++serial, method, params }) });
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  if (!r.ok) return { http: r.status };
  const body = await r.json(); assert(!body.error, `rpc_${method}_failed`); return { http: r.status, result: body.result };
}
const anonymous = await rpc('', 'tools/list'); assert.equal(anonymous.http, 401);
console.log(JSON.stringify({ at: new Date().toISOString(), anonymous: 401, financialBefore: financeBefore }));
for (const email of ['frederik@aproposmagazine.com', 'casper@aproposmagazine.com'].filter(email => !process.argv.includes('--editor-only') || email.startsWith('casper'))) {
  const user = await admin.getUserByEmail(email); assert(user.emailVerified && !user.disabled, 'verified_existing_member_required');
  const welcomeRef = db.collection('mcpWelcomeMail').doc(user.uid), welcome = (await welcomeRef.get()).data();
  // First-time OAuth activation could send a welcome; use only an ordinary
  // authenticated app read in that case. Do not fabricate or backfill an outbox.
  const welcomeBefore = cmsFieldHash(welcome ?? null);
  const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `mcp-release-${randomUUID()}`);
  const auth = getAuth(app); let access = '', clientId = '';
  try {
    const signed = await signInWithCustomToken(auth, await admin.createCustomToken(user.uid));
    const idToken = await signed.user.getIdToken();
    if (!welcome || welcome.pending) {
      assert(email.startsWith('casper'), 'owner_requires_existing_completed_welcome');
      const denied = await fetch(`${origin}/api/editorial/submissions?id=${submissionId}`, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${idToken}` } });
      assert.equal(denied.headers.get('cache-control'), 'private, no-store');
      assert.equal(denied.status, 409);
      assert.deepEqual(await denied.json(), { error: 'mcp_submission_not_found' });
      assert.equal(cmsFieldHash((await welcomeRef.get()).data() ?? null), welcomeBefore);
      console.log(JSON.stringify({ at: new Date().toISOString(), role: 'editor', privateAppReadDenied: true,
        freshMcpOAuth: 'not_run_first_activation_requires_personal_pilot', welcomeUnchanged: true, humanLoginOrApprovalTest: false }));
      continue;
    }
    const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
    const client = await json('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [redirect], client_name: 'Apropos release read-only verification' }) });
    clientId = client.client_id;
    const verifier = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', resource: MCP_RESOURCE, scope: 'apropos:read', state: randomUUID(),
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    const authorize = await fetch(`${origin}/oauth/authorize?${params}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    assert.equal(authorize.status, 302);
    const request = new URL(authorize.headers.get('location')!).searchParams.get('request');
    const cookie = authorize.headers.get('set-cookie')!.split(';')[0];
    const allowed = await json('/oauth/consent', { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ request, allow: true }) });
    const code = new URL(allowed.redirect).searchParams.get('code')!;
    const tokens = await json('/oauth/token', form({ client_id: clientId, grant_type: 'authorization_code', resource: MCP_RESOURCE, redirect_uri: redirect, code_verifier: verifier, code }));
    access = tokens.access_token;
    const init = await rpc(access, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'release-verification', version: '1' } });
    assert.equal(init.result.serverInfo.version, MCP_VERSION);
    const discovery = (await rpc(access, 'tools/list')).result;
    assert(discovery.tools.some((t: any) => t.name === 'preview_submission'));
    const confirm = discovery.tools.find((t: any) => t.name === 'confirm_submission_action');
    assert.deepEqual(confirm._meta.ui.visibility, ['app']);
    const resource = (await rpc(access, 'resources/read', { uri: 'ui://apropos/article-preview-v1.html' })).result.contents[0];
    assert.equal(resource.text, articleWidgetHtml); assert.deepEqual(resource._meta.ui.csp, ARTICLE_WIDGET_CSP);
    const workflow = (await rpc(access, 'tools/call', { name: 'get_workflow', arguments: { workflow: 'submit' } })).result;
    assert(!workflow.isError);
    const own = (await rpc(access, 'tools/call', { name: 'list_submissions', arguments: {} })).result; assert(!own.isError);
    const protectedRead = (await rpc(access, 'tools/call', { name: 'get_submission_status', arguments: { submissionId } })).result;
    if (email.startsWith('casper')) {
      assert.equal(protectedRead.isError, true); assert(!JSON.stringify(protectedRead).includes('db6736eaea25c57a3'));
      const global = (await rpc(access, 'tools/call', { name: 'get_liv_status', arguments: {} })).result; assert.equal(global.isError, true);
    } else {
      assert(!protectedRead.isError); const status = JSON.parse(protectedRead.content.find((c: any) => c.type === 'text').text);
      assert.equal(status.status, 'published'); assert.equal(status.revision, 10);
    }
    // Fresh token works. Revoking this grant must immediately reject its bearer.
    const refreshed = await json('/oauth/token', form({ client_id: clientId, grant_type: 'refresh_token', resource: MCP_RESOURCE, refresh_token: tokens.refresh_token }));
    access = refreshed.access_token; assert.equal((await rpc(access, 'tools/list')).http, 200);
    await json('/oauth/revoke', form({ client_id: clientId, token: access }));
    assert.equal((await rpc(access, 'tools/list')).http, 401); access = '';
    assert.equal(cmsFieldHash((await welcomeRef.get()).data()), welcomeBefore);
    console.log(JSON.stringify({ at: new Date().toISOString(), role: email.startsWith('casper') ? 'editor' : 'owner', version: MCP_VERSION,
      tools: discovery.tools.length, pkce: true, discovery: true, inlineResource: true, ownList: true,
      privacyCheck: email.startsWith('casper') ? 'other_private_article_and_owner_tool_denied' : 'existing_published_revision10_preserved',
      refresh: true, revokedBearerRejected: true, welcomeUnchanged: true, humanLoginOrApprovalTest: false }));
  } finally {
    if (access) await json('/oauth/revoke', form({ client_id: clientId, token: access }));
    await signOut(auth); await deleteApp(app);
  }
}
assert.equal(await financial(), financeBefore);
assert.equal(cmsFieldHash((await protectedRef.get()).data()), savedBefore);
console.log(JSON.stringify({ at: new Date().toISOString(), financialUnchanged: true, submissionUnchanged: true,
  paidAiCalls: 0, articleWrites: 0, personalApprovals: 0, mode: 'service-authenticated-read-only', existingConnectionsUntouched: true }));
