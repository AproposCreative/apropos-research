import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
const mock = vi.hoisted(() => ({ identity: null as any, rate: vi.fn(), audit: vi.fn(), drafts: vi.fn(), workspace: vi.fn(), context: vi.fn(), publish: vi.fn(), publicationStatus: vi.fn(), shortening: vi.fn(), shorteningContext: vi.fn(), shorteningPreview: vi.fn(), shorteningApply: vi.fn() }));
const reader = vi.hoisted(() => ({ register: vi.fn(), list: vi.fn(), get: vi.fn(), save: vi.fn() }));
const seo = vi.hoisted(() => ({ claim: vi.fn(), status: vi.fn(), save: vi.fn(), apply: vi.fn() }));
const ideas = vi.hoisted(() => ({ desk: vi.fn(), save: vi.fn(), get: vi.fn(), start: vi.fn() }));
const mail = vi.hoisted(() => ({ search: vi.fn(), read: vi.fn(), save: vi.fn(), status: vi.fn(), preview: vi.fn(), confirm: vi.fn() }));
const accreditation = vi.hoisted(() => ({ preview: vi.fn(), confirm: vi.fn() }));
vi.mock('@/lib/accreditation/mcp-drafts', async original => ({ ...await original<any>(), previewAccreditationDraft: accreditation.preview, confirmAccreditationDraft: accreditation.confirm }));
vi.mock('@/lib/editorial-mail/service', async original => ({ ...await original<any>(), searchEditorialMail: mail.search, readEditorialMail: mail.read,
  saveEditorialReply: mail.save, getEditorialReply: mail.status, previewEditorialReply: mail.preview, confirmEditorialReply: mail.confirm }));
const imageBrief = vi.hoisted(() => vi.fn());
const imageClaim = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editorial/image-attempt-resume', async original => ({ ...await original<any>(), claimSubmissionImageAttempt: imageClaim }));
vi.mock('@/lib/editorial/chat-image-brief', async original => ({ ...await original<any>(), getChatImageBrief: imageBrief }));
vi.mock('@/lib/editorial/ideas', async original => ({ ...await original<any>(), getEditorialDesk: ideas.desk,
  saveEditorialIdeas: ideas.save, getEditorialIdea: ideas.get, startEditorialIdea: ideas.start }));
vi.mock('@/lib/seo-engine/post-publish/chat', () => ({ claimSeoTasks: seo.claim, getSeoTask: seo.status, saveSeoReview: seo.save, applySeoReview: seo.apply }));
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
it('exposes accreditation workflow with private UI-only send and owner-only tools', async () => {
  const tools = (await (await POST(message('tools/list'))).json()).result.tools;
  const names = tools.filter((t: any) => /^(get|search|list|save|link|set|sync|preview|confirm)_accreditation_/.test(t.name));
  expect(names).toHaveLength(12);
  const research = tools.find((t: any) => t.name === 'research_accreditation_event');
  expect(research.annotations.readOnlyHint).toBe(true);
  expect(research._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['apropos:read'] }]);
  expect(research.inputSchema.required).toContain('sourceEventUrl');
  expect(names.find((t: any) => t.name === 'confirm_accreditation_draft')._meta.ui.visibility).toEqual(['app']);
  expect(names.find((t: any) => t.name === 'confirm_accreditation_draft')._meta['openai/visibility']).toBe('private');
  accreditation.preview.mockResolvedValue({ data: { approvalId: 'fixture', body: 'Exact application' }, confirmation: { token: 'PRIVATE-UI-ONLY' } });
  const result = (await (await call('preview_accreditation_draft', { approvalId: 'fixture' })).json()).result;
  expect(result._meta.confirmation.token).toBe('PRIVATE-UI-ONLY'); expect(JSON.stringify(result.content)).not.toContain('PRIVATE-UI-ONLY');
  mock.identity.owner = false;
  for (const t of names) expect((await (await call(t.name, {})).json()).result.isError).toBe(true);
  expect(accreditation.confirm).not.toHaveBeenCalled(); expect(accreditation.preview).toHaveBeenCalledTimes(1);
});
it('exposes owner mail reads/drafts, keeps send app-only and approval secrets out of model content', async () => {
  const tools = (await (await POST(message('tools/list'))).json()).result.tools;
  const hidden = tools.find((t: any) => t.name === 'confirm_editorial_reply');
  expect(hidden._meta.ui.visibility).toEqual(['app']); expect(hidden._meta['openai/visibility']).toBe('private'); expect(hidden.annotations.destructiveHint).toBe(true);
  expect(tools.find((t: any) => t.name === 'preview_editorial_reply')._meta.ui.resourceUri).toBe('ui://apropos/mail-reply-v3.html');
  const d = { draftId: 'a'.repeat(64), contentHash: 'b'.repeat(64), body: 'Exact reply', from: 'frederik@aproposmagazine.com', to: 'press@example.test' };
  mail.preview.mockResolvedValue({ data: d, confirmation: { token: 'MAIL-UI-ONLY-SECRET' } });
  const r = (await (await call('preview_editorial_reply', { draftId: d.draftId })).json()).result;
  expect(r.structuredContent).toEqual(d); expect(r._meta.confirmation.token).toBe('MAIL-UI-ONLY-SECRET'); expect(JSON.stringify(r.content)).not.toContain('MAIL-UI-ONLY-SECRET');
  mock.identity.owner = false;
  for(const name of ['compose_editorial_mail','sync_editorial_draft','get_editorial_mail_thread','repair_editorial_sent'])expect((await(await call(name,{})).json()).result.isError).toBe(true);
  expect((await (await call('search_editorial_mail', { mailbox: 'frederik' })).json()).result.isError).toBe(true); expect(mail.search).not.toHaveBeenCalled();
  mock.identity.owner = true; mail.search.mockImplementation(() => assertPaidAiAllowed());
  expect((await (await call('search_editorial_mail', { mailbox: 'frederik' })).json()).result.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
  expect(JSON.stringify(mock.audit.mock.calls)).not.toContain('Exact reply'); expect(mail.confirm).not.toHaveBeenCalled();
});
it.each([1, 2, 3])('resolves the mail resource from cached v%s tool descriptors without exposing private mail', async version => {
  const uri = `ui://apropos/mail-reply-v${version}.html`;
  const response = await POST(message('resources/read', { uri }));
  const result = (await response.json()).result;
  expect(result.contents[0]).toMatchObject({ uri, mimeType: 'text/html;profile=mcp-app' });
  expect(result.contents[0].text).toContain('Godkend og send');
  expect(result.contents[0]._meta.ui.prefersBorder).toBe(true);
  expect(JSON.stringify(result)).not.toContain('MAIL-UI-ONLY-SECRET');
  expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'mail_resource_read', resourceUri: uri }));
  expect(mail.preview).not.toHaveBeenCalled(); expect(mail.confirm).not.toHaveBeenCalled();
});
it.each(['frederik', 'liv'])('rejects every mail tool for a non-owner admin, including known private draft IDs: %s', async mailbox => {
  mock.identity = { uid: 'colleague', owner: false, grantId: 'other-grant', role: 'admin', scopes: ['apropos:read', 'apropos:draft', 'apropos:publish'] };
  const calls: [string, Record<string, unknown>][] = [
    ['search_editorial_mail', { mailbox }],
    ['read_editorial_mail', { mailbox, folder: 'inbox', uid: 15, uidValidity: '122' }],
    ['save_editorial_reply', { messageId: 'a'.repeat(64), expectedSourceHash: 'b'.repeat(64), expectedRevision: 0, body: 'Private reply', requestId: 'access-denial-test' }],
    ['get_editorial_reply', { draftId: 'a'.repeat(64) }],
    ['preview_editorial_reply', { draftId: 'a'.repeat(64) }],
    ['confirm_editorial_reply', { token: 'a'.repeat(43), displayedHash: 'b'.repeat(64) }],
  ];
  for (const [name, args] of calls) {
    const result = (await (await call(name, args)).json()).result;
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result._meta?.confirmation).toBeUndefined();
  }
  for (const handler of Object.values(mail)) expect(handler).not.toHaveBeenCalled();
});
it('transports the exact canonical prompt and separate ordered image blocks, not a reconstructed image-generation instruction', async () => {
  // Protocol-only fixture: proves what MCP returns, not what the native host consumes.
  const brief = { briefId: 'b'.repeat(64), prompt: 'Exact canonical prompt.\nFirst reference is STYLE ONLY.\nOne standalone illustration.',
    generationContract: { canGenerate: false, exactPromptExecutionVerified: false } };
  const style = { data: Buffer.from('style-byte-fixture').toString('base64'), mimeType: 'image/jpeg' };
  const subject = { data: Buffer.from('subject-byte-fixture').toString('base64'), mimeType: 'image/png' };
  imageBrief.mockResolvedValue({ brief, reference: style, additionalReferences: [subject] });
  const args = { submissionId: 'a'.repeat(64), expectedRevision: 2, role: 'cover', sectionId: 'c'.repeat(64),
    excerpt: 'An unchanged article passage.', description: 'The requested portrait, not the earlier child cover.',
    subjectReferenceIds: ['d'.repeat(64)], subjectReferencesRequired: true };
  const result = (await (await call('get_image_brief', args)).json()).result;
  expect(result.isError).not.toBe(true);
  expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(brief) },
    { type: 'image', ...style }, { type: 'image', ...subject }]);
  expect(imageBrief).toHaveBeenCalledExactlyOnceWith('frederik', { ...args, style: 'expressive' });
  expect(JSON.parse(result.content[0].text).generationContract.canGenerate).toBe(false);
});
it('discovers the editorial desk widget, keeps selection private and denies paid models or caller UID', async () => {
  const listed = (await (await POST(message('tools/list'))).json()).result.tools;
  const desk = listed.find((t: any) => t.name === 'get_editorial_desk');
  expect(desk._meta.ui.resourceUri).toBe('ui://apropos/editorial-desk-v1.html');
  mock.identity.owner = false;
  ideas.desk.mockResolvedValue({ ideas: [], drafts: [], paidAiCalls: 0 });
  const response = (await (await call('get_editorial_desk')).json()).result;
  expect(response.structuredContent.ideas).toEqual([]); expect(ideas.desk).toHaveBeenCalledExactlyOnceWith('frederik', { limit: 10 });
  const args = { ideaId: 'a'.repeat(64), expectedRevision: 1 };
  mock.identity.scopes = ['apropos:read'];
  expect((await (await call('start_editorial_idea', args)).json()).result.isError).toBe(true); expect(ideas.start).not.toHaveBeenCalled();
  mock.identity.scopes.push('apropos:draft'); ideas.start.mockImplementation(() => assertPaidAiAllowed());
  expect((await (await call('start_editorial_idea', args)).json()).result.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
  expect((await (await call('get_editorial_idea', { ideaId: args.ideaId, uid: 'other' })).json()).result.isError).toBe(true);
});
it('authenticates before initialization or exposing tool schemas', async () => {
  mock.identity = null; const response = await POST(message('tools/list'));
  expect(response.status).toBe(401); expect(response.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource'); expect(mock.audit).not.toHaveBeenCalled();
});
it('diagnoses unsupported transport versions without accepting them or leaking request data', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const request = message('tools/list');
    request.headers.set('mcp-protocol-version', '2099-01-01');
    request.headers.set('authorization', 'Bearer PRIVATE-TOKEN');
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain('Unsupported protocol version');
    expect(warning).toHaveBeenCalledExactlyOnceWith('mcp_transport_rejected', {
      version: MCP_VERSION, status: 400, category: 'unsupported_protocol_version', protocolVersion: '2099-01-01',
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('PRIVATE-TOKEN');
    expect(mock.audit).not.toHaveBeenCalled();
  } finally { warning.mockRestore(); }
});
it('redacts malformed protocol headers and preserves successful discovery after a rejected probe', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const request = message('tools/list');
    request.headers.set('mcp-protocol-version', 'PRIVATE-INPUT');
    expect((await POST(request)).status).toBe(400);
    expect(warning).toHaveBeenCalledWith('mcp_transport_rejected', expect.objectContaining({ protocolVersion: 'invalid' }));
    expect(JSON.stringify(warning.mock.calls)).not.toContain('PRIVATE-INPUT');
    const listed = await POST(message('tools/list'));
    expect(listed.status).toBe(200);
    expect((await listed.json()).result.tools.some((t: any) => t.name === 'claim_submission_image_attempt')).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
  } finally { warning.mockRestore(); }
});
it('logs invalid JSON-RPC without the submitted article content', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const request = new Request(`${MCP_ORIGIN}/mcp`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ article: 'PRIVATE-ARTICLE', authorization: 'PRIVATE-CREDENTIAL' }) });
    expect((await POST(request)).status).toBe(400);
    expect(warning).toHaveBeenCalledExactlyOnceWith('mcp_transport_rejected', {
      version: MCP_VERSION, status: 400, category: 'invalid_json_rpc', protocolVersion: 'absent',
    });
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(/PRIVATE/);
    expect(mock.audit).not.toHaveBeenCalled();
  } finally { warning.mockRestore(); }
});
it('negotiates the real SDK protocol and lists strict schemas on independent stateless requests', async () => {
  const initialized = await POST(message('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } }));
  expect(initialized.status).toBe(200);
  expect((await initialized.json()).result.serverInfo).toEqual({
    name: 'apropos-editorial', title: 'Apropos AI', version: MCP_VERSION, websiteUrl: MCP_ORIGIN,
    icons: [{ src: MCP_ICON, mimeType: 'image/png', sizes: ['256x256'] }],
  });
  const response = await POST(message('tools/list')); const tools = (await response.json()).result.tools;
  const social = tools.find((t: any) => t.name === 'prepare_submission').inputSchema.properties.article.properties.socialSubtitles;
  expect(social.properties.square.maxLength).toBe(90);
  expect(social.properties.story.maxLength).toBe(130);
  expect(tools.find((t: any) => t.name === 'update_submission').inputSchema.properties.article.properties.socialSubtitles).toBeDefined();
  expect(tools.length).toBe(87); expect(tools.find((t: any) => t.name === 'publish_article').annotations.destructiveHint).toBe(true);
  expect(tools.find((t: any) => t.name === 'resume_submission_cms').inputSchema.required).toContain('expectedCmsHash');
  expect(tools.find((t: any) => t.name === 'import_submission_press_image').inputSchema.required).toContain('candidateId');
  expect(tools.find((t: any) => t.name === 'preview_submission_press_image').annotations.readOnlyHint).toBe(true);
  expect(tools.find((t: any) => t.name === 'get_liv_production_context').annotations.readOnlyHint).toBe(true);
  expect(tools.find((t: any) => t.name === 'get_publication_status').annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
  expect(tools.find((t: any) => t.name === 'save_draft').inputSchema.additionalProperties).toBe(false);
  expect(tools.find((t: any) => t.name === 'publish_article')._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['apropos:publish'] }]);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('exposes only consumption of an existing image grant with owner/draft scope, strict schema and paid-call guard', async () => {
  const listed = (await (await POST(message('tools/list'))).json()).result.tools;
  const claim = listed.find((t: any) => t.name === 'claim_submission_image_attempt');
  expect(claim.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
  expect(claim._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['apropos:draft'] }]);
  expect(claim.inputSchema.additionalProperties).toBe(false);
  expect(claim.inputSchema.properties.decision).toBeUndefined();
  expect(claim.inputSchema.properties.inputMode.enum).toEqual(['explicit_arguments', 'conversation_context']);
  expect(listed.find((t: any) => t.name === 'preflight_submission_image').inputSchema.properties.inputMode.enum)
    .toEqual(['explicit_arguments', 'conversation_context']);
  expect(listed.some((t: any) => /authorize.*image|approve.*image/.test(t.name))).toBe(false);
  const args = { submissionId: 'a'.repeat(64), expectedRevision: 2, role: 'cover', sectionId: 'b'.repeat(64),
    briefId: 'c'.repeat(64), grantId: 'd'.repeat(64), requestId: 'existing-owner-decision', inputMode: 'explicit_arguments' };
  mock.identity.scopes = ['apropos:read'];
  expect((await (await call('claim_submission_image_attempt', args)).json()).result.isError).toBe(true);
  mock.identity.scopes.push('apropos:draft'); mock.identity.owner = false;
  expect((await (await call('claim_submission_image_attempt', args)).json()).result.isError).toBe(true);
  expect(imageClaim).not.toHaveBeenCalled(); mock.identity.owner = true;
  expect((await (await call('claim_submission_image_attempt', { ...args, decision: 'Invented approval' })).json()).result.isError).toBe(true);
  expect(imageClaim).not.toHaveBeenCalled();
  imageClaim.mockResolvedValue({ dispatchAllowed: false, generationStarted: false });
  const result = (await (await call('claim_submission_image_attempt', args)).json()).result;
  expect(JSON.parse(result.content[0].text).dispatchAllowed).toBe(false);
  expect(imageClaim).toHaveBeenCalledExactlyOnceWith('frederik', args);
  expect((await (await call('claim_submission_image_attempt', { ...args, inputMode: 'conversation_context' })).json()).result.isError).not.toBe(true);
  expect(imageClaim).toHaveBeenLastCalledWith('frederik', { ...args, inputMode: 'conversation_context' });
  imageClaim.mockImplementation(() => assertPaidAiAllowed());
  expect((await (await call('claim_submission_image_attempt', args)).json()).result.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
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
  const liv = JSON.parse((await (await call('get_workflow', { workflow: 'liv' })).json()).result.content[0].text);
  expect(liv.instructions).toContain('get_liv_production_context'); expect(liv.paidAiCalls).toBe(0);
  mock.identity.owner = false;
  expect((await (await call('get_liv_production_context')).json()).result.isError).toBe(true);
});
it.each(['submit', 'liv', 'editorial'])('keeps the verified press workflow available in %s without personal approval or paid AI', async workflow => {
  mock.identity.scopes = ['apropos:read'];
  const response = (await (await call('get_workflow', { workflow })).json()).result;
  expect(response.isError).not.toBe(true);
  const data = JSON.parse(response.content[0].text);
  expect(data).toMatchObject({ workflow, paidAiCalls: 0, publicationApproval: false });
  expect(data.versionHash).toMatch(/^[a-f0-9]{64}$/);
  for (const step of ['find_submission_images', 'preview_submission_press_image', 'import_submission_press_image',
    'searchId/candidateId', 'revision/sectionId', 'stabilt requestId', 'ukendt licens forbliver ukendt']) {
    expect(data.instructions).toContain(step);
  }
  expect(data.instructions).toContain('Manglende billeder færdiggøres før personlig redaktionel bekræftelse');
  expect(data.instructions).toContain('Ved timeout læs status');
  expect(mock.publish).not.toHaveBeenCalled();
});
it.each(['review', 'publish'])('routes %s back to canonical submission media completion before personal confirmation', async workflow => {
  mock.identity.scopes = ['apropos:read'];
  const response = (await (await call('get_workflow', { workflow })).json()).result;
  expect(response.isError).not.toBe(true);
  const data = JSON.parse(response.content[0].text);
  expect(data).toMatchObject({ workflow, paidAiCalls: 0, publicationApproval: false });
  for (const step of ['textReadyForPreparation', 'missingMedia', 'handoff.nextAction', 'submit', 'reused:true']) {
    expect(data.instructions).toContain(step);
  }
  expect(mock.publish).not.toHaveBeenCalled();
});
it('discovers owner-only SEO tools with exact write scope, durable identity and no-paid enforcement', async () => {
  const taskId = 'a'.repeat(64), args = { taskId, proposalHash: 'b'.repeat(64), recheck: {
    readFullArticle: true, supported: true, betterOrKept: true, reason: 'Læsningen er kontrolleret mod hele artiklen.' } };
  const workflow = JSON.parse((await (await call('get_workflow', { workflow: 'seo' })).json()).result.content[0].text);
  expect(workflow.instructions).toContain('claim_seo_tasks'); expect(workflow.serverFactCheckPerformed).toBe(false);
  expect(workflow.instructions).toContain('Preserve good metadata');
  const listed = (await (await POST(message('tools/list'))).json()).result.tools;
  expect(listed.find((t: any) => t.name === 'apply_seo_review')._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['apropos:publish'] }]);
  expect(listed.find((t: any) => t.name === 'get_seo_task').annotations.readOnlyHint).toBe(true);
  mock.identity.scopes = ['apropos:read', 'apropos:draft'];
  expect((await (await call('apply_seo_review', args)).json()).result.isError).toBe(true); expect(seo.apply).not.toHaveBeenCalled();
  mock.identity.scopes.push('apropos:publish'); mock.identity.owner = false;
  expect((await (await call('apply_seo_review', args)).json()).result.isError).toBe(true); expect(seo.apply).not.toHaveBeenCalled();
  mock.identity.owner = true; seo.apply.mockImplementation(async () => assertPaidAiAllowed());
  expect((await (await call('apply_seo_review', args)).json()).result.content[0].text).toContain('mcp_paid_call_requires_separate_approval');
  expect(seo.apply).toHaveBeenCalledExactlyOnceWith('frederik', args);
  expect((await (await call('get_seo_task', { taskId, uid: 'different-owner' })).json()).result.isError).toBe(true);
  seo.status.mockRejectedValue(Error('seo_chat_context_changed'));
  expect((await (await call('get_seo_task', { taskId })).json()).result.content[0].text).toContain('seo_chat_context_changed');
});
it('advertises optional compact SEO transport and forwards a known hash without changing ownership', async () => {
  const taskId = 'a'.repeat(64), knownContextHash = 'b'.repeat(64);
  const listed = (await (await POST(message('tools/list'))).json()).result.tools;
  const schema = listed.find((t: any) => t.name === 'get_seo_task').inputSchema;
  expect(schema.required).toEqual(['taskId']); expect(schema.properties.knownContextHash).toBeTruthy();
  seo.status.mockResolvedValue({ context: null, contextIncluded: false, contextHash: knownContextHash });
  const result = JSON.parse((await (await call('get_seo_task', { taskId, knownContextHash })).json()).result.content[0].text);
  expect(result.contextIncluded).toBe(false); expect(seo.status).toHaveBeenCalledExactlyOnceWith('frederik', taskId, knownContextHash, undefined);
  expect(schema.properties.refreshGoogle.type).toBe('boolean');
  seo.status.mockClear();
  await call('get_seo_task', { taskId, knownContextHash, refreshGoogle: true });
  expect(seo.status).toHaveBeenCalledExactlyOnceWith('frederik', taskId, knownContextHash, true);
  expect((await (await call('get_seo_task', { taskId, knownContextHash: 'invalid' })).json()).result.isError).toBe(true);
  const workflow = JSON.parse((await (await call('get_workflow', { workflow: 'seo' })).json()).result.content[0].text);
  expect(workflow.instructions).toContain('mistet grundlag'); expect(workflow.instructions).toContain('frisk dubletkontrol');
  expect(workflow.instructions).toContain('no_rows'); expect(workflow.instructions).toContain('locale_mismatch');
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
it('explains rejected reader boundary flags without suggesting fabricated ranges or a blind retry', async () => {
  reader.save.mockRejectedValue(new Error('mcp_reader_boundary_unobserved'));
  const args = { sourceId: 'a'.repeat(64), requestId: 'middle-reading-batch', expectedRevision: 2,
    access: 'available', observedAt: '2026-10-06T18:00:00.000Z',
    layout: { key: 'fixture-layout', totalPositions: 154 }, checkpoint: { position: 10, chapter: '2', anchor: 'Fixture' },
    readRanges: [{ start: 7, end: 10, chapter: '2' }], beginningObserved: true };
  const result = (await (await call('save_reader_progress', args)).json()).result;
  expect(result.isError).toBe(true);
  const error = JSON.parse(result.content[0].text);
  expect(error).toMatchObject({ error: 'mcp_reader_boundary_unobserved', paidAiAllowed: false });
  expect(error.action).toContain('beginningObserved=false'); expect(error.action).toContain('endObserved=false');
  expect(error.action).toContain('layout.totalPositions'); expect(error.action).toContain('gentag ikke uændret input');
  expect(mock.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tool: 'save_reader_progress', status: 'error',
    errorCode: 'mcp_reader_boundary_unobserved', paidAiAllowed: false }));
  const tools = (await (await POST(message('tools/list'))).json()).result.tools;
  const props = tools.find((t: any) => t.name === 'save_reader_progress').inputSchema.properties;
  expect(props.beginningObserved.description).toContain('THIS batch only');
  expect(props.endObserved.description).toContain('Not a chapter or batch end');
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
  expect(file.inputSchema.properties.generationReport.properties.effectivePrompt).toBeTruthy();
  expect(file.inputSchema.required).not.toContain('generationReport');
  expect(file.inputSchema.properties.generationReport.properties.outputCheck.properties.sha256).toBeTruthy();
  expect(tools.find((t: any) => t.name === 'store_submission_image_reference')._meta['openai/fileParams']).toEqual(['file']);
  expect(tools.find((t: any) => t.name === 'store_submission_image_reference')._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['apropos:draft'] }]);
  expect(tools.find((t: any) => t.name === 'get_image_brief').description).toContain('Do not summarize, rewrite, embellish');
  const preflight = tools.find((t: any) => t.name === 'preflight_submission_image');
  expect(preflight.annotations.readOnlyHint).toBe(true);
  expect(preflight.inputSchema.required).toEqual(expect.arrayContaining(['submissionId', 'expectedRevision', 'role', 'sectionId', 'subjectReferencesRequired', 'subjectReferenceIds']));
  expect(preflight.inputSchema.properties).not.toHaveProperty('exactPromptExecutionVerified');
  expect(tools.find((t: any) => t.name === 'preview_submission_image_failure').annotations.readOnlyHint).toBe(true);
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
