import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
const mock = vi.hoisted(() => ({ identity: null as any, rate: vi.fn(), audit: vi.fn(), drafts: vi.fn(), workspace: vi.fn(), context: vi.fn(), publish: vi.fn(), publicationStatus: vi.fn(), shortening: vi.fn(), shorteningContext: vi.fn(), shorteningPreview: vi.fn(), shorteningApply: vi.fn() }));
const reader = vi.hoisted(() => ({ register: vi.fn(), list: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/mcp/reader', async original => ({ ...await original<any>(), registerReaderSource: reader.register,
  listReaderSources: reader.list, getReaderProgress: reader.get, saveReaderProgress: reader.save }));
vi.mock('@/lib/editorial/chat-preview', async original => ({ ...await original<any>(), chatSubmissionPreview: async () => ({
  data: { submissionId: 'a'.repeat(64), article: { title: 'Private preview' }, paidAiCalls: 0 },
  confirmation: { token: 'UI-ONLY-SECRET', action: 'checks' }, imagePreviews: {} }) }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => ({ create: mock.audit }) }) }) }));
vi.mock('@/lib/mcp/oauth', async original => ({ ...await original<any>(), authenticateMcp: async () => mock.identity, oauthRateLimit: mock.rate }));
vi.mock('@/lib/image-gen/webflow', () => ({ listImageGenArticles: async () => ({ articles: [], nextCursor: null }) }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: async () => ({ entries: [], slots: {} }), claimPreparation: vi.fn(), releasePreparation: vi.fn() }));
vi.mock('@/lib/liv/delivery-alert-context', () => ({ readDeliveryAlertContext: async () => ({ blockers: ['provider_quota_exhausted'], title: 'Ingen færdig artikel' }) }));
vi.mock('@/lib/liv/preparation-status', () => ({ readNextLivPreparationStatus: async () => ({ ready: false }) }));
vi.mock('@/lib/liv/weekly-plan', () => ({ readWeeklyPlan: async () => [] }));
vi.mock('@/lib/ai/cost-actions', () => ({ readCostActions: async () => ({ estimate: 0 }) }));
vi.mock('@/lib/liv/cost-ledger', () => ({ readSharedCostSummary: async () => ({ billed: null }) }));
vi.mock('@/lib/liv/editorial-edit', () => ({ editorialEditInput: z.object({}).strict(), editLivEditorialCheckpoint: vi.fn() }));
vi.mock('@/lib/liv/edit-saved-writing', () => ({ savedWritingEditInput: z.object({}).strict(), editSavedLivWriting: vi.fn() }));
vi.mock('@/lib/mcp/editorial', () => ({ getCmsArticle: vi.fn(), openCmsArticle: vi.fn(), editorialContext: mock.context,
  getLivWork: vi.fn(), getWritingBrief: vi.fn(), getWorkspace: mock.workspace, saveCms: vi.fn(), getSaveStatus: vi.fn(),
  cmsSaveInput: z.object({ draftId: z.string(), expectedRevision: z.number() }), runIdSchema: z.string() }));
vi.mock('@/lib/mcp/workspace', async original => ({ ...await original<any>(), draftInput: z.object({ expectedRevision: z.number(), draftId: z.string(), article: z.object({ title: z.string(), content: z.string() }).strict() }).strict(), saveMcpDraft: vi.fn() }));
vi.mock('@/lib/mcp/publication', () => ({ previewPublication: vi.fn(), executePublication: mock.publish, getPublicationStatus: mock.publicationStatus }));
vi.mock('@/lib/mcp/shortening', async original => ({ ...await original<any>(), getShorteningContext: mock.shorteningContext,
  previewExternalShortening: mock.shorteningPreview, getExternalShortening: mock.shortening, applyExternalShortening: mock.shorteningApply }));
vi.mock('@/lib/editorial/work-catalog', async original => ({ ...await original<any>(), listEditorialWork: async () => ({ items: [], paidAiCalls: 0 }) }));
vi.mock('@/lib/editorial/draft-overview', async original => ({ ...await original<any>(), listDrafts: mock.drafts }));
vi.mock('@/lib/editorial/workspace-copyedit', async original => ({ ...await original<any>(), previewWorkspaceCopyedit: vi.fn(), applyWorkspaceCopyedit: vi.fn() }));
vi.mock('@/lib/editorial/review-workspace', async original => ({ ...await original<any>(), reviewWorkspace: vi.fn() }));
import { POST, GET } from '@/app/mcp/route';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
import { OAuthError } from '@/lib/mcp/oauth';
import { MCP_ICON, MCP_ORIGIN, MCP_VERSION } from '@/lib/mcp/config';
import { ChatFileError } from '@/lib/editorial/chat-file-error';
beforeEach(() => { vi.clearAllMocks(); mock.identity = { uid: 'frederik', owner: true, grantId: 'grant', role: 'admin', scopes: ['apropos:read', 'apropos:draft', 'apropos:publish'] };
  mock.rate.mockResolvedValue(undefined); mock.audit.mockResolvedValue(undefined); mock.workspace.mockResolvedValue({ revision: 1 }); mock.context.mockResolvedValue({ author: 'Liv' }); });
const message = (method: string, params?: unknown) => new Request(`${MCP_ORIGIN}/mcp`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }) });
const call = (name: string, args = {}) => POST(message('tools/call', { name, arguments: args }));
it('authenticates before initialization or exposing tool schemas', async () => {
  mock.identity = null; const response = await POST(message('tools/list'));
  expect(response.status).toBe(401); expect(response.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource'); expect(mock.audit).not.toHaveBeenCalled();
});
it('negotiates the real SDK protocol and lists strict schemas on independent stateless requests', async () => {
  const initialized = await POST(message('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } }));
  expect(initialized.status).toBe(200);
  expect((await initialized.json()).result.serverInfo).toEqual({
    name: 'apropos-editorial', title: 'Apropos AI', version: MCP_VERSION, websiteUrl: MCP_ORIGIN,
    icons: [{ src: MCP_ICON, mimeType: 'image/png', sizes: ['256x256'] }],
  });
  const response = await POST(message('tools/list')); const tools = (await response.json()).result.tools;
  expect(tools.length).toBe(47); expect(tools.find((t: any) => t.name === 'publish_article').annotations.destructiveHint).toBe(true);
  expect(tools.find((t: any) => t.name === 'get_publication_status').annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
  expect(tools.find((t: any) => t.name === 'save_draft').inputSchema.additionalProperties).toBe(false);
  expect(tools.find((t: any) => t.name === 'publish_article')._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['apropos:publish'] }]);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('returns the compact overview in one read-only call, enforcing strict user scope and no-paid guard', async () => {
  mock.drafts.mockResolvedValue({ items: [{ title: 'Gemte kladder', blockers: [] }], paidAiCalls: 0 });
  const result = (await (await call('list_drafts')).json()).result;
  expect(JSON.parse(result.content[0].text).items).toHaveLength(1);
  expect(mock.drafts).toHaveBeenCalledExactlyOnceWith('frederik', { limit: 5 });
  expect(mock.workspace).not.toHaveBeenCalled();
  expect(mock.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tool: 'list_drafts', status: 'ok', paidAiAllowed: false }));
  const tools = (await (await POST(message('tools/list'))).json()).result.tools;
  expect(tools.find((t: any) => t.name === 'list_drafts').annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  for (const args of [{ uid: 'casper' }, { limit: 11 }, { query: 'x'.repeat(151) }]) {
    expect((await (await call('list_drafts', args)).json()).result.isError).toBe(true);
  }
  expect(mock.drafts).toHaveBeenCalledTimes(1);
  mock.identity.scopes = ['apropos:draft'];
  expect((await (await call('list_drafts')).json()).result.isError).toBe(true);
  mock.identity.scopes = ['apropos:read']; mock.identity.owner = false;
  expect((await (await call('list_drafts')).json()).result.isError).not.toBe(true);
  mock.identity.owner = true; mock.drafts.mockImplementation(async () => { assertPaidAiAllowed(); });
  expect((await (await call('list_drafts')).json()).result.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
});
it('exposes shortening without a human-approval tool and enforces owner, scopes, strict identity and no-paid boundary', async () => {
  const proposalId = 'a'.repeat(64), candidateHash = 'b'.repeat(64), apply = { proposalId, candidateHash };
  const tools = (await (await POST(message('tools/list'))).json()).result.tools;
  expect(tools.find((t: any) => t.name === 'get_shortening_status').annotations.readOnlyHint).toBe(true);
  expect(tools.find((t: any) => t.name === 'apply_shortening').annotations.destructiveHint).toBe(true);
  expect(tools.map((t: any) => t.name).join(' ')).not.toMatch(/confirm_shortening|approve_shortening/);
  mock.shortening.mockResolvedValue({ reviewed: false });
  expect((await (await call('get_shortening_status', { proposalId })).json()).result.isError).not.toBe(true);
  expect(mock.shortening).toHaveBeenCalledExactlyOnceWith('frederik', proposalId);
  expect((await (await call('get_shortening_status', { proposalId, uid: 'milo' })).json()).result.isError).toBe(true);
  mock.identity.scopes = ['apropos:read'];
  expect((await (await call('apply_shortening', apply)).json()).result.isError).toBe(true); expect(mock.shorteningApply).not.toHaveBeenCalled();
  mock.identity.scopes = ['apropos:draft']; mock.shorteningApply.mockImplementation(async () => { assertPaidAiAllowed(); });
  const denied = (await (await call('apply_shortening', apply)).json()).result;
  expect(denied.isError).toBe(true); expect(denied.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
  expect(mock.shorteningApply).toHaveBeenCalledExactlyOnceWith('frederik', apply);
  mock.identity.owner = false;
  expect((await (await call('apply_shortening', apply)).json()).result.isError).toBe(true); expect(mock.shorteningApply).toHaveBeenCalledTimes(1);
});
it('returns bounded workflow guidance and discovery through the actual MCP protocol', async () => {
  const result = (await (await call('get_workflow', { workflow: 'edit' })).json()).result;
  const data = JSON.parse(result.content[0].text);
  expect(data.instructions).toContain('preview_copyedit'); expect(data.instructions.length).toBeLessThan(3000);
  expect(data.versionHash).toMatch(/^[a-f0-9]{64}$/); expect(data.publicationApproval).toBe(false);
  expect((await (await call('get_workflow', { workflow: '../../.env' })).json()).result.isError).toBe(true);
  expect((await (await call('list_editorial_work')).json()).result.isError).not.toBe(true);
});
it('exposes private cloud-reading tools to team members with exact scopes, no-paid guard and metadata-only audit', async () => {
  mock.identity.owner = false; mock.identity.uid = 'casper'; mock.identity.scopes = ['apropos:read'];
  reader.list.mockResolvedValue({ items: [], paidAiCalls: 0 });
  expect((await (await call('list_reader_sources')).json()).result.isError).not.toBe(true);
  expect(reader.list).toHaveBeenCalledExactlyOnceWith('casper', { limit: 5 });
  const args = { sourceUrl: 'https://bibliotek.kk.dk/reader?orderid=00000000-0000-4000-8000-000000000001', title: 'Privat bog', author: 'Test' };
  expect((await (await call('register_reader_source', args)).json()).result.isError).toBe(true);
  expect(reader.register).not.toHaveBeenCalled();
  mock.identity.scopes = ['apropos:read', 'apropos:draft'];
  reader.register.mockImplementation(async () => { assertPaidAiAllowed(); });
  const guarded = (await (await call('register_reader_source', args)).json()).result;
  expect(guarded.isError).toBe(true); expect(guarded.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
  expect(reader.register).toHaveBeenCalledExactlyOnceWith('casper', args);
  expect(JSON.stringify(mock.audit.mock.calls)).not.toContain('orderid=');
  expect(JSON.stringify(mock.audit.mock.calls)).not.toContain('Privat bog');
  expect((await (await call('register_reader_source', { ...args, uid: 'frederik' })).json()).result.isError).toBe(true);
  expect(reader.register).toHaveBeenCalledTimes(1);
  const read = JSON.parse((await (await call('get_workflow', { workflow: 'read' })).json()).result.content[0].text);
  expect(read.instructions).toContain('save_reader_progress'); expect(read.publicationApproval).toBe(false);
  const tools = (await (await POST(message('tools/list'))).json()).result.tools;
  expect(tools.find((t: any) => t.name === 'save_reader_progress')._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['apropos:draft'] }]);
  expect(tools.find((t: any) => t.name === 'find_reader_notes').annotations.readOnlyHint).toBe(true);
});
it('requires draft scope for the new precise mutation, not just read scope', async () => {
  mock.identity.scopes = ['apropos:read'];
  const result = (await (await call('apply_copyedit', { draftId: 'draft-1234', expectedRevision: 1,
    previewHash: 'a'.repeat(64), patches: [{ field: 'intro', before: 'Old', after: 'New' }] })).json()).result;
  expect(result.isError).toBe(true); expect(result._meta['mcp/www_authenticate'][0]).toContain('apropos:draft');
});
it('registers an actual MCP App, sends secrets only through UI metadata and declares host-supplied file inputs', async () => {
  const tools = (await (await POST(message('tools/list'))).json()).result.tools;
  const preview = tools.find((t: any) => t.name === 'preview_submission');
  expect(preview._meta.ui.resourceUri).toBe('ui://apropos/article-preview-v1.html'); expect(preview.outputSchema).toBeTruthy();
  expect(tools.find((t: any) => t.name === 'confirm_submission_action')._meta.ui.visibility).toEqual(['app']);
  const file = tools.find((t: any) => t.name === 'import_submission_image');
  expect(file._meta['openai/fileParams']).toEqual(['file']);
  expect(Object.keys(file.inputSchema.properties.file.properties)).toEqual(['download_url', 'file_id', 'mime_type', 'file_name']);
  const result = (await (await call('preview_submission', { submissionId: 'a'.repeat(64) })).json()).result;
  expect(result._meta.confirmation.token).toBe('UI-ONLY-SECRET');
  expect(JSON.stringify([result.structuredContent, result.content])).not.toContain('UI-ONLY-SECRET');
  const resource = (await (await POST(message('resources/read', { uri: preview._meta.ui.resourceUri }))).json()).result.contents[0];
  expect(resource.mimeType).toBe('text/html;profile=mcp-app'); expect(resource.text).toContain('ui/initialize');
  expect(resource._meta.ui.csp.connectDomains).toEqual([]);
});
it('runs real saved-metadata checks via MCP, with source binding and no paid model', async () => {
  mock.identity.scopes = ['apropos:read'];
  const index = JSON.parse((await (await call('get_metadata_test_cases')).json()).result.content[0].text);
  expect(index.totalCases).toBe(20); expect(index.cases[0].source).toBeUndefined();
  const selected = JSON.parse((await (await call('get_metadata_test_cases', { caseId: index.cases[0].caseId })).json()).result.content[0].text);
  expect(selected.source.bodyText.length).toBeGreaterThan(100);
  const input = { caseId: selected.caseId, sourceHash: selected.sourceHash, proposed: {
    ...selected.original, seoTitle: selected.original.seoTitle.replace(selected.primaryTerm, 'Forkert navn'),
  } };
  const result = JSON.parse((await (await call('review_metadata_candidate', input)).json()).result.content[0].text);
  expect(result.regressions).toContainEqual(expect.objectContaining({ code: 'primary_name_missing' }));
  expect(result).toMatchObject({ paidAiCalls: 0, cmsChanged: false, publicationApproval: false, humanQualityScore: null });
  const conflict = (await (await call('review_metadata_candidate', { ...input, sourceHash: '0'.repeat(64) })).json()).result;
  expect(conflict.isError).toBe(true); expect(conflict.content[0].text).toContain('mcp_metadata_source_version_conflict');
  expect((await (await call('get_metadata_test_cases', { caseId: '../../.env' })).json()).result.isError).toBe(true);
  mock.identity.owner = false;
  expect((await (await call('get_metadata_test_cases')).json()).result.isError).toBe(true);
});
it('passes only the authenticated UID, never a caller-supplied workspace owner', async () => {
  const response = await call('get_workspace'); expect((await response.json()).result.isError).not.toBe(true);
  expect(mock.workspace).toHaveBeenCalledExactlyOnceWith('frederik', undefined);
  const bad = await call('get_workspace', { uid: 'casper' }); expect((await bad.json()).result.isError).toBe(true); expect(mock.workspace).toHaveBeenCalledTimes(1);
});
it('requires the matching scope at the tool boundary with an OAuth challenge', async () => {
  mock.identity.scopes = ['apropos:read']; const response = await call('publish_article', { previewId: '00000000-0000-4000-8000-000000000000' });
  const result = (await response.json()).result; expect(result.isError).toBe(true); expect(result._meta['mcp/www_authenticate'][0]).toContain('insufficient_scope'); expect(mock.publish).not.toHaveBeenCalled();
});
it('denies a nested paid call, sanitizes errors and records only operation metadata', async () => {
  mock.context.mockImplementation(async () => { assertPaidAiAllowed(); });
  const response = await call('get_editorial_context'); const result = (await response.json()).result;
  expect(result.isError).toBe(true); expect(result.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
  expect(mock.audit.mock.calls[0][0]).toMatchObject({ tool: 'get_editorial_context', paidAiAllowed: false, status: 'error' });
  mock.context.mockRejectedValue(Error('sk-private-secret https://example.com/?token=bad'));
  const error = await (await call('get_editorial_context')).json(); expect(JSON.stringify(error)).not.toContain('sk-private');
});
it('records safe file-error diagnostics and actionable recovery without leaking signed URLs', async () => {
  mock.context.mockRejectedValue(new ChatFileError('mcp_submission_file_host_invalid', 'unsupported.example.com'));
  const result = (await (await call('get_editorial_context')).json()).result;
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text)).toMatchObject({ rejectedHost: 'unsupported.example.com', regenerateImage: false, paidAiAllowed: false });
  expect(mock.audit.mock.calls[0][0]).toMatchObject({ errorCode: 'mcp_submission_file_host_invalid', rejectedHost: 'unsupported.example.com' });
});
it('has no raw database, code execution, budget or paid research tool', async () => {
  const result = await (await POST(message('tools/list'))).json();
  expect(result.result.tools.map((t: any) => t.name).join(' ')).not.toMatch(/exec|sql|fetch_url|set_budget|generate_image|paid_research|retry_run/);
});
it('scopes read-only publication status to the authenticated user and prohibits paid work', async () => {
  const previewId = '00000000-0000-4000-8000-000000000000';
  mock.publicationStatus.mockResolvedValue({ publicationVerified: false, readOnly: true });
  expect(JSON.parse((await (await call('get_publication_status', { previewId })).json()).result.content[0].text)).toMatchObject({ readOnly: true });
  expect(mock.publicationStatus).toHaveBeenCalledExactlyOnceWith('frederik', previewId);
  expect((await (await call('get_publication_status', { previewId, uid: 'casper' })).json()).result.isError).toBe(true);
  mock.identity.scopes = ['apropos:read'];
  expect((await (await call('get_publication_status', { previewId })).json()).result.isError).toBe(true);
  expect(mock.publicationStatus).toHaveBeenCalledTimes(1);
  mock.identity.scopes = ['apropos:publish'];
  mock.publicationStatus.mockImplementation(async () => { assertPaidAiAllowed(); });
  const denied = (await (await call('get_publication_status', { previewId })).json()).result;
  expect(denied.isError).toBe(true); expect(denied.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
});
it('preserves rate-limit HTTP errors and refuses cross-origin browser posts', async () => {
  mock.rate.mockRejectedValue(new OAuthError('rate_limited', 429)); expect((await POST(message('tools/list'))).status).toBe(429);
  const req = message('tools/list'); req.headers.set('origin', 'https://evil.example'); expect((await POST(req)).status).toBe(403);
  expect(GET().status).toBe(405);
});
