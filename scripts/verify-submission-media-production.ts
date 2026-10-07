import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { registerClient, startAuthorization, consent, exchangeToken, revokeToken, opaque } from '../lib/mcp/oauth';
import { createHash } from 'node:crypto';
import { MCP_ORIGIN, MCP_RESOURCE, MCP_VERSION } from '../lib/mcp/config';
import { cmsFieldHash } from '../lib/liv/cms-field-hash';

// Scoped service-client verification. This is NOT a native ChatGPT file test or
// personal publication approval. Never creates/publishes an article or calls AI.
const id = '396904fb485abe48df3663e0b3d8c955a83ecc3670c323aa1c1c2838040785a2';
const itemId = '6ac561f59604a82185235285';
// Supply through the existing authorized service-env loader; never print/save
// credentials or read a browser session. No OpenAI key is needed.
for (const name of ['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY']) {
  if (!process.env[name]) throw Error(`service_env_required:${name}`);
}
const auth = getAdminAuth()!, db = getAdminDb()!;
const owner = await auth.getUserByEmail('frederik@aproposmagazine.com');
if (!owner.emailVerified || owner.disabled) throw Error('owner_unavailable');
if (!(await db.collection('mcpWelcomeMail').doc(owner.uid).get()).exists) throw Error('existing_connection_required');
const protectedRefs = ['livCostLedger/month-2026-10', 'imageGenCostLedger/month-2026-10', 'mcpWelcomeMail/' + owner.uid];
async function protectedSnapshot() {
  const holds = await db.collection('aiProviderHolds').limit(100).get();
  if (holds.size === 100) throw Error('provider_hold_scan_incomplete');
  return [...await Promise.all(protectedRefs.map(async path => cmsFieldHash((await db.doc(path).get()).data() || {}))),
    cmsFieldHash(Object.fromEntries(holds.docs.map(doc => [doc.id, doc.data()])))];
}
const before = await protectedSnapshot();
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
const client = await registerClient({ redirect_uris: [redirect] }), verifier = opaque(), cookie = opaque();
const request = await startAuthorization({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code', resource: MCP_RESOURCE,
  scope: 'apropos:read apropos:draft', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: opaque() }, cookie);
const approval = await consent(request, cookie, owner.uid, true);
const token = await exchangeToken({ client_id: client.client_id, redirect_uri: redirect, resource: MCP_RESOURCE,
  grant_type: 'authorization_code', code_verifier: verifier, code: new URL(approval).searchParams.get('code')! });
let seq = 0;
async function rpc(method: string, params: unknown = {}) {
  const response = await fetch(`${MCP_ORIGIN}/mcp`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }) });
  if (!response.ok) throw Error(`mcp_http_${response.status}`);
  const data = await response.json(); if (data.error) throw Error('mcp_protocol_failed'); return data.result;
}
async function call(name: string, args: unknown) {
  const result = await rpc('tools/call', { name, arguments: args });
  const data = JSON.parse(result.content.find((c: { type: string }) => c.type === 'text').text);
  if (result.isError) throw Error(data.error || 'mcp_operation_failed'); return data;
}
try {
  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'apropos-media-regression', version: '1' } });
  if (init.serverInfo.version !== MCP_VERSION) throw Error('release_version_mismatch');
  const list = await rpc('tools/list');
  const tool = list.tools.find((t: { name: string }) => t.name === 'import_submission_image');
  if (tool?._meta?.['openai/fileParams']?.[0] !== 'file' || !tool.inputSchema.properties.file.properties.file_name) throw Error('native_file_contract_missing');
  console.log(JSON.stringify({ version: init.serverInfo.version, tools: list.tools.length, nativeFileContract: true }));
  let status = await call('get_submission_status', { submissionId: id });
  if (status.publishedTarget.itemId !== itemId) throw Error('existing_target_mismatch');
  const inspect = await call('link_published_submission', { submissionId: id, itemId, expectedRevision: status.revision, mode: 'inspect' });
  console.log(JSON.stringify({ revision: status.revision, cmsHash: inspect.cmsHash, divergence: inspect.divergence, changedFields: inspect.changedFields, conflicts: inspect.conflicts }));
  if (process.argv.includes('--refresh-existing') && inspect.divergence) {
    if (inspect.conflicts.length) throw Error('reconcile_requires_editor_choice');
    const refreshed = await call('link_published_submission', { submissionId: id, itemId, expectedRevision: status.revision,
      mode: 'refresh', expectedCmsHash: inspect.cmsHash, requestId: `book-media-refresh-${inspect.cmsHash.slice(0,40)}` });
    console.log(JSON.stringify({ refreshed }));
    status = await call('get_submission_status', { submissionId: id });
    const after = await call('link_published_submission', { submissionId: id, itemId, expectedRevision: status.revision, mode: 'inspect' });
    if (after.divergence || after.cmsHash !== inspect.cmsHash) throw Error('refresh_readback_failed');
  }
  const preview = await call('preview_submission', { submissionId: id });
  // Deliberately never log the private UI confirmation token or book prose.
  console.log(JSON.stringify({ revision: status.revision, status: status.status, target: status.publishedTarget.itemId,
    mediaImports: status.mediaImports, mediaIdentity: status.mediaIdentity, recommended: status.recommendedMedia,
    missing: preview.missing, providerBlocked: preview.quote?.provider?.blocked, estimate: preview.quote?.estimatedDkk,
    publicationReady: preview.publication?.ready || false, approvalAttempted: false }));
  const after = await protectedSnapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('protected_state_changed');
  console.log(JSON.stringify({ protectedStateUnchanged: true, articleCreated: false, cmsWrites: 0, paidAiCalls: 0 }));
} finally {
  await revokeToken(token.access_token, client.client_id);
  console.log(JSON.stringify({ serviceGrantRevoked: true, userConnectionsUntouched: true }));
}
