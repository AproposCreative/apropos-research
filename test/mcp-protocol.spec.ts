import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
const mock = vi.hoisted(() => ({ identity: null as any, rate: vi.fn(), audit: vi.fn(), workspace: vi.fn(), context: vi.fn(), publish: vi.fn() }));
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
vi.mock('@/lib/mcp/workspace', () => ({ draftInput: z.object({ expectedRevision: z.number(), draftId: z.string(), article: z.object({ title: z.string(), content: z.string() }).strict() }).strict(), saveMcpDraft: vi.fn() }));
vi.mock('@/lib/mcp/publication', () => ({ previewPublication: vi.fn(), executePublication: mock.publish }));
import { POST, GET } from '@/app/mcp/route';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
import { OAuthError } from '@/lib/mcp/oauth';
import { MCP_ORIGIN } from '@/lib/mcp/config';
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
  expect(initialized.status).toBe(200); expect((await initialized.json()).result.serverInfo.name).toBe('apropos-editorial');
  const response = await POST(message('tools/list')); const tools = (await response.json()).result.tools;
  expect(tools.length).toBe(16); expect(tools.find((t: any) => t.name === 'publish_article').annotations.destructiveHint).toBe(true);
  expect(tools.find((t: any) => t.name === 'save_draft').inputSchema.additionalProperties).toBe(false);
  expect(tools.find((t: any) => t.name === 'publish_article')._meta.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['apropos:publish'] }]);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
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
it('has no raw database, code execution, budget or paid research tool', async () => {
  const result = await (await POST(message('tools/list'))).json();
  expect(result.result.tools.map((t: any) => t.name).join(' ')).not.toMatch(/exec|sql|fetch_url|set_budget|generate_image|paid_research|retry_run/);
});
it('preserves rate-limit HTTP errors and refuses cross-origin browser posts', async () => {
  mock.rate.mockRejectedValue(new OAuthError('rate_limited', 429)); expect((await POST(message('tools/list'))).status).toBe(429);
  const req = message('tools/list'); req.headers.set('origin', 'https://evil.example'); expect((await POST(req)).status).toBe(403);
  expect(GET().status).toBe(405);
});
