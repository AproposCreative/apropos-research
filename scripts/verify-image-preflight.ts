/** Read-only ARTICLE regression. An ephemeral authenticated service OAuth grant
 * is created/revoked; no brief, image, CMS item, editorial consent or AI call. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { cmsFieldHash } from '../lib/liv/cms-field-hash';
import { MCP_ORIGIN as origin, MCP_VERSION } from '../lib/mcp/config';

assert.equal(process.env.APROPOS_IMAGE_PREFLIGHT_VERIFY, 'read-only-no-generation');
const admin = getAdminAuth()!, db = getAdminDb()!;
const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
assert(owner.emailVerified && !owner.disabled);
const id = '546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171';
const ref = db.collection('editorialSubmissions').doc(id), row = (await ref.get()).data()!;
assert(row.uid === owner.uid && row.status === 'draft');
// Stop on a new editorial version rather than treating the supplied v2 as fresh.
assert.equal(row.revision, 2); assert.equal(row.contentHash, 'a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846');
async function protectedState() {
  const children = await Promise.all(['chatAssets', 'chatBriefs', 'imageReferences', 'imageFailures', 'updates', 'versions', 'publicationConsents', 'stages'].map(async name => ({
    name, rows: (await ref.collection(name).get()).docs.map(d => ({ id: d.id, ...d.data() })) })));
  return cmsFieldHash({ row: (await ref.get()).data(), children });
}
async function financial() {
  return cmsFieldHash({ shared: (await db.collection('livCostLedger').doc('month-2026-10').get()).data() ?? null,
    images: (await db.collection('imageGenCostLedger').doc('month-2026-10').get()).data() ?? null,
    holds: (await db.collection('aiProviderHolds').limit(10).get()).docs.map(d => d.data()),
    policy: (await db.collection('aiExecutionPolicies').doc('paid').get()).data() ?? null });
}
const before = await protectedState(), financeBefore = await financial();
const welcomeRef = db.collection('mcpWelcomeMail').doc(owner.uid), welcome = (await welcomeRef.get()).data();
assert(welcome && !welcome.pending, 'avoid_new_welcome_mail');
const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `image-preflight-${randomUUID()}`);
const auth = getAuth(app); let access = '', clientId = '', serial = 0;
async function json(path: string, init: RequestInit = {}) {
  const response = await fetch(origin + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(40000) });
  assert(response.ok, `http_${path.split('?')[0]}_${response.status}`); return response.json();
}
const form = (data: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) });
async function rpc(method: string, params: unknown = {}) {
  const data = await json('/mcp', { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++serial, method, params }) });
  assert(!data.error, 'rpc_failed'); return data.result;
}
async function call(name: string, args: unknown) {
  const result = await rpc('tools/call', { name, arguments: args }); assert(!result.isError, `tool_${name}_failed`);
  return JSON.parse(result.content.find((c: any) => c.type === 'text').text);
}
try {
  const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid)), idToken = await signed.user.getIdToken();
  const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const client = await json('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [redirect], client_name: 'Apropos read-only image preflight verification' }) });
  clientId = client.client_id;
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', resource: `${origin}/mcp`,
    scope: 'apropos:read', state: randomUUID(), code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  const requested = await fetch(`${origin}/oauth/authorize?${params}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(requested.status, 302);
  const request = new URL(requested.headers.get('location')!).searchParams.get('request'), cookie = requested.headers.get('set-cookie')!.split(';')[0];
  const allowed = await json('/oauth/consent', { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ request, allow: true }) });
  const token = await json('/oauth/token', form({ client_id: clientId, grant_type: 'authorization_code', resource: `${origin}/mcp`, redirect_uri: redirect,
    code_verifier: verifier, code: new URL(allowed.redirect).searchParams.get('code')! }));
  access = token.access_token;
  const init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'read-only-image-preflight', version: '1' } });
  assert.equal(init.serverInfo.version, MCP_VERSION);
  assert(init.instructions.includes('preflight_submission_image'));
  const discovery = await rpc('tools/list'), preflight = discovery.tools.find((t: any) => t.name === 'preflight_submission_image');
  assert(preflight.annotations.readOnlyHint && !preflight.inputSchema.properties.exactPromptExecutionVerified);
  const workflow = await call('get_workflow', { workflow: 'submit' }); assert(workflow.instructions.includes('canGenerate=false'));
  const status = await call('get_submission_status', { submissionId: id });
  assert.equal(status.revision, row.revision); assert.equal(status.imageGeneration.canGenerate, null);
  assert.equal(status.imageGeneration.preflightRequired, true);
  assert.equal(status.imageGeneration.exactPromptExecutionVerified, false);
  const context = await call('get_submission_media_context', { submissionId: id });
  const sections = context.article.sections;
  const briefs: Array<Record<string, any>> = (await ref.collection('chatBriefs').get()).docs.map(d => ({ ...d.data(), briefId: d.id }));
  const subjectId = 'c13fe1fe30ddbc062db6a053e93927c25947e429818f0425a3160e6e09a6cb81';
  const currentCover = briefs.find((b: any) => b.expectedRevision === row.revision && b.role === 'cover' &&
    b.subjectReferenceIds?.includes(subjectId)); assert(currentCover);
  const find = (text: string) => { const section = sections.find((s: any) => s.text.includes(text)); assert(section, 'regression_anchor_missing'); return section.id; };
  // Provisional read-only placement checks, not a newly saved/approved image plan.
  const placements = [
    { name: 'cover-selfie', role: 'cover', sectionId: currentCover.sectionId, briefId: currentCover.briefId },
    { name: 'body-1-wooden-block', role: 'body', sectionId: find('smide nogle træklodser') },
    { name: 'body-2-cafe-table', role: 'body', sectionId: find('en espressomaskine') },
    { name: 'body-3-child-playhouse', role: 'body', sectionId: find('min datter tilsyneladende havde en glimrende eftermiddag') },
  ];
  const results = [];
  for (const { name, ...placement } of placements) {
    const result = await call('preflight_submission_image', { submissionId: id, expectedRevision: row.revision,
      ...placement, subjectReferencesRequired: true, subjectReferenceIds: name === 'cover-selfie' ? [subjectId] : [] });
    assert.equal(result.canGenerate, name === 'cover-selfie'); assert.equal(result.canImportGeneratedImage, false);
    assert.equal(result.integration.exactPromptExecutionVerified, false);
    if (name === 'cover-selfie') {
      assert.deepEqual(result.blockers, []); assert.equal(result.inputsComplete, true);
      assert.deepEqual(result.references.map((r: any) => r.purpose), ['style', 'subject']);
      assert.equal(result.references[1].sha256, '690d2f3b6f288210f4b69ed1381c6ef86132f10cc0c9b3b15f6737936733fe6f');
    } else assert(result.blockers.includes('mcp_submission_subject_reference_required'));
    assert(!result.blockers.includes('mcp_submission_image_content_changed'), 'missing_old_baseline_is_not_article_mutation');
    results.push({ name, ...result });
  }
  assert.equal(await protectedState(), before, 'article_briefs_assets_or_approvals_changed');
  const financeAfter = await financial();
  assert.equal(cmsFieldHash((await welcomeRef.get()).data()), cmsFieldHash(welcome));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), version: MCP_VERSION, tools: discovery.tools.length,
    submissionId: id, revision: row.revision, contentHash: row.contentHash, savedBriefCount: briefs.length,
    subjectReferenceCount: (await ref.collection('imageReferences').get()).size, results,
    protectedStateHash: before, financialBefore: financeBefore, financialAfter: financeAfter, financialUnchanged: financeBefore === financeAfter,
    articleTextMetadataBriefsReferencesAssetsApprovalsUnchanged: true, nativeGenerationTested: false,
    cmsWrites: 0, imageImports: 0, paidAiCalls: 0, personalApproval: false }));
} finally {
  if (access) await json('/oauth/revoke', form({ client_id: clientId, token: access }));
  await signOut(auth); await deleteApp(app);
  console.log(JSON.stringify({ testGrantRevoked: !!access, existingConnectionsUntouched: true }));
}
