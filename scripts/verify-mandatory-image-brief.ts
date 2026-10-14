/** Explicit service-authenticated release check. No image generation, usable
 * import, CMS write or personal editorial consent. Existing credentials only. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { cmsFieldHash } from '../lib/liv/cms-field-hash';
import { MCP_ORIGIN as origin, MCP_VERSION } from '../lib/mcp/config';

assert.equal(process.env.APROPOS_IMAGE_CONTRACT_VERIFY, 'no-generation-no-cms');
const admin = getAdminAuth()!, db = getAdminDb()!;
const owner = await admin.getUserByEmail('frederik@aproposmagazine.com');
assert(owner.emailVerified && !owner.disabled);
const id = 'c3069f83503fbf3d443743682358ea85afc13724726fa4f6a7db6b625eb4cb8a';
const ref = db.collection('editorialSubmissions').doc(id), row = (await ref.get()).data()!;
assert(row.uid === owner.uid && row.status === 'draft' && !['film', 'tv-series'].includes(row.article.subjectType));
async function protectedState() {
  const collections = await Promise.all(['chatAssets', 'versions', 'approvals', 'publicationConsents'].map(async name => ({
    name, rows: (await ref.collection(name).get()).docs.map(d => ({ id: d.id, ...d.data() })) })));
  return cmsFieldHash({ row: (await ref.get()).data(), collections });
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
const app = initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY }, `image-contract-${randomUUID()}`);
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
  const result = await rpc('tools/call', { name, arguments: args }); assert(!result.isError, `tool_${name}_failed`); return result;
}
const parsed = (result: any) => JSON.parse(result.content.find((c: any) => c.type === 'text').text);
try {
  const signed = await signInWithCustomToken(auth, await admin.createCustomToken(owner.uid)), idToken = await signed.user.getIdToken();
  const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const client = await json('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [redirect], client_name: 'Apropos image contract release verification' }) });
  clientId = client.client_id;
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', resource: `${origin}/mcp`,
    scope: 'apropos:read apropos:draft', state: randomUUID(), code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  const requested = await fetch(`${origin}/oauth/authorize?${params}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(requested.status, 302);
  const request = new URL(requested.headers.get('location')!).searchParams.get('request'), cookie = requested.headers.get('set-cookie')!.split(';')[0];
  const allowed = await json('/oauth/consent', { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ request, allow: true }) });
  const code = new URL(allowed.redirect).searchParams.get('code')!;
  const token = await json('/oauth/token', form({ client_id: clientId, grant_type: 'authorization_code', resource: `${origin}/mcp`, redirect_uri: redirect, code_verifier: verifier, code }));
  access = token.access_token;
  const init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'image-contract-verifier', version: '1' } });
  assert.equal(init.serverInfo.version, MCP_VERSION);
  const discovery = await rpc('tools/list'), referenceTool = discovery.tools.find((t: any) => t.name === 'store_submission_image_reference');
  assert.deepEqual(referenceTool._meta['openai/fileParams'], ['file']);
  const workflow = parsed(await call('get_workflow', { workflow: 'submit' }));
  assert(JSON.stringify(workflow).includes('MANDATORY: Before each generation'));
  const context = parsed(await call('get_submission_media_context', { submissionId: id }));
  const sections = context.sections || context.article?.sections;
  assert(sections?.length, 'section_context_missing');
  const section = sections.find((s: any) => s.text?.length >= 10); assert(section);
  const briefInput = { submissionId: id, expectedRevision: row.revision, sectionId: section.id, excerpt: section.text.slice(0, 1000),
    description: 'En selvstændig redaktionel illustration af udstillingens rum og materialer.', role: 'cover', style: 'expressive' };
  const result = await call('get_image_brief', briefInput), brief = parsed(result);
  const actual = Buffer.from(result.content.find((c: any) => c.type === 'image').data, 'base64');
  assert.equal(createHash('sha256').update(actual).digest('hex'), brief.referenceHash);
  assert.equal(createHash('sha256').update(brief.prompt).digest('hex'), brief.canonicalPromptHash);
  assert.equal(brief.handoffVersion, 'canonical-native-image-v2');
  assert.equal(brief.generationContract.exactPromptExecutionVerified, false);
  await sharp(actual).stats();
  assert.equal(parsed(await call('get_image_brief', briefInput)).briefId, brief.briefId);
  const fake = { submissionId: id, expectedRevision: row.revision, requestId: 'negative-contract-v29-no-image',
    kind: 'illustration', origin: 'chatgpt-generated', role: 'cover', sectionId: section.id,
    file: { file_id: 'negative-fixture-not-an-image', download_url: 'https://example.invalid/not-fetched' },
    alt: 'Negative contract test', caption: '', credit: 'No actual image' };
  const rejected: string[] = [];
  const report = { effectivePrompt: brief.prompt, referenceHashes: brief.requiredReferenceHashes,
    outputCheck: { sha256: '0'.repeat(64), inspected: false, imageType: 'article-mockup', singleImage: false, textVisible: true, logosVisible: false, watermarkVisible: false } };
  for (const [args, error] of [
    [fake, 'mcp_submission_brief_required'],
    [{ ...fake, briefId: brief.briefId }, 'mcp_submission_generation_report_required'],
    [{ ...fake, briefId: brief.briefId, generationReport: report }, 'mcp_submission_output_inspection_required'],
    [{ ...fake, briefId: brief.briefId, generationReport: { ...report, outputCheck: { ...report.outputCheck, inspected: true } } }, 'mcp_submission_generated_image_type_invalid'],
  ] as const) {
    const negative = await rpc('tools/call', { name: 'import_submission_image', arguments: args });
    assert(negative.isError); assert.equal(parsed(negative).error, error); rejected.push(error);
  }
  assert.equal(await protectedState(), before, 'article_assets_or_approvals_changed');
  assert.equal(await financial(), financeBefore, 'financial_state_changed');
  assert.equal(cmsFieldHash((await welcomeRef.get()).data()), cmsFieldHash(welcome));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), version: MCP_VERSION, tools: discovery.tools.length,
    submissionId: id, revision: row.revision, briefId: brief.briefId, styleReferenceSha256: brief.referenceHash,
    referenceBytes: actual.length, canonicalPromptHash: brief.canonicalPromptHash, briefReplayStable: true, rejected,
    protectedStateHash: before, financialHash: financeBefore, savedArticleAssetsApprovalsUnchanged: true, financialUnchanged: true,
    nativeGenerationTested: false, cmsWrites: 0, paidAiCalls: 0, personalApproval: false }));
} finally {
  if (access) await json('/oauth/revoke', form({ client_id: clientId, token: access }));
  await signOut(auth); await deleteApp(app);
  console.log(JSON.stringify({ testGrantRevoked: !!access, existingConnectionsUntouched: true }));
}
