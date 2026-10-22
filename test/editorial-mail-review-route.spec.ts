import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ access: null as any, rate: vi.fn(), preview: vi.fn(), status: vi.fn(), confirm: vi.fn(), save: vi.fn(), sync: vi.fn(), thread: vi.fn() }));
vi.mock('@/lib/mcp/oauth', async original => ({ ...await original<any>(), mcpRequestAccess: async () => mock.access, oauthRateLimit: mock.rate }));
vi.mock('@/lib/editorial-mail/service', () => ({ getEditorialReply: mock.status, previewEditorialReply: mock.preview, confirmEditorialReply: mock.confirm,
  saveEditorialReply: mock.save, syncEditorialDraft: mock.sync, getEditorialMailThread: mock.thread }));
import { POST } from '@/app/oauth/mail-review/route';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
const draftId = 'a'.repeat(64), contentHash = 'b'.repeat(64), cookie = '__Host-apropos-mail-review=' + 'c'.repeat(43);
const current = { draftId, contentHash, source: { id: 'd'.repeat(64), sourceHash: 'e'.repeat(64) } };
function request(name = 'preview_editorial_reply', input: unknown = { draftId }, options: { cookie?: string; origin?: string; draft?: string } = {}) {
  return new Request('https://ai.aproposmagazine.com/oauth/mail-review', { method: 'POST',
    headers: { Origin: options.origin ?? 'https://ai.aproposmagazine.com', ...(options.cookie ? { Cookie: options.cookie } : {}) },
    body: JSON.stringify({ name, draftId: options.draft || draftId, input }) });
}
beforeEach(() => {
  vi.clearAllMocks(); mock.access = { uid: 'owner', owner: true, role: 'admin' };
  mock.status.mockResolvedValue(current); mock.rate.mockResolvedValue(undefined);
  mock.preview.mockResolvedValue({ data: current, confirmation: { token: 'fixture-only', expiresAt: 123 } });
  mock.confirm.mockResolvedValue({ ...current, status: 'accepted' });
});
it('opening a review only previews; no approval/send; sets private browser cookie and no-store', async () => {
  const res = await POST(request());
  expect(res.status).toBe(200); expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(res.headers.get('set-cookie')).toMatch(/Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600/);
  expect(await res.json()).toEqual({ structuredContent: current, _meta: { confirmation: { token: 'fixture-only', expiresAt: 123 } } });
  expect(mock.confirm).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled(); expect(mock.sync).not.toHaveBeenCalled();
});
it('requires real owner access and same-origin for all browser operations', async () => {
  for (const access of [null, { uid: 'colleague', owner: false, role: 'admin' }]) {
    mock.access = access; expect((await POST(request())).status).toBe(403);
  }
  mock.access = { uid: 'owner', owner: true }; expect((await POST(request('preview_editorial_reply', { draftId }, { origin: 'https://evil.test' }))).status).toBe(400);
  expect(mock.preview).not.toHaveBeenCalled(); expect(mock.confirm).not.toHaveBeenCalled();
});
it('requires a browser cookie plus the exact displayed version before forwarding explicit confirm', async () => {
  const input = { token: 't'.repeat(43), displayedHash: contentHash };
  expect((await POST(request('confirm_editorial_reply', input))).status).toBe(403);
  expect((await POST(request('confirm_editorial_reply', { ...input, displayedHash: 'f'.repeat(64) }, { cookie }))).status).toBe(400);
  expect(mock.confirm).not.toHaveBeenCalled();
  expect((await POST(request('confirm_editorial_reply', input, { cookie }))).status).toBe(200);
  expect(mock.confirm).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ uid: 'owner', grantId: expect.stringMatching(/^mail-review:[a-f0-9]{64}:a{64}$/) }), input);
});
it('binds preview/confirm grants to the same browser and draft, never the MCP grant', async () => {
  await POST(request('preview_editorial_reply', { draftId }, { cookie }));
  await POST(request('confirm_editorial_reply', { token: 't'.repeat(43), displayedHash: contentHash }, { cookie }));
  expect(mock.preview.mock.calls[0][0].grantId).toBe(mock.confirm.mock.calls[0][0].grantId);
  await POST(request('preview_editorial_reply', { draftId }, { cookie: cookie.replace(/c/g, 'z') }));
  expect(mock.preview.mock.calls[1][0].grantId).not.toBe(mock.preview.mock.calls[0][0].grantId);
});
it.each(['constructor', '__proto__', 'send', 'compose_editorial_mail'])('rejects an unsupported action %s', async name => {
  expect((await POST(request(name, {}, { cookie }))).status).toBe(400); expect(mock.confirm).not.toHaveBeenCalled();
});
it('rejects cross-draft and cross-source operations', async () => {
  for (const name of ['preview_editorial_reply', 'sync_editorial_draft', 'get_editorial_mail_thread'])
    expect((await POST(request(name, { draftId: 'f'.repeat(64) }, { cookie }))).status).toBe(400);
  expect((await POST(request('save_editorial_reply', { messageId: 'f'.repeat(64), expectedSourceHash: current.source.sourceHash }, { cookie }))).status).toBe(400);
  expect(mock.preview).not.toHaveBeenCalled(); expect(mock.sync).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
});
it('protects against paid calls and secret leakage in failures', async () => {
  mock.preview.mockImplementation(() => assertPaidAiAllowed()); expect((await POST(request())).status).toBe(400);
  mock.preview.mockRejectedValue(Error('SMTP password SECRET'));
  expect(await (await POST(request())).json()).toEqual({ error: 'mcp_mail_invalid_request' });
});
