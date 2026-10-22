import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ access: null as any, rate: vi.fn(), search: vi.fn(), read: vi.fn(), draft: vi.fn(), status: vi.fn(), connection: vi.fn() }));
vi.mock('@/lib/mcp/oauth', async original => ({ ...await original<any>(), mcpRequestAccess: async () => mock.access, oauthRateLimit: mock.rate }));
vi.mock('@/lib/editorial-mail/service', () => ({ searchEditorialMail: mock.search, readEditorialMail: mock.read, saveEditorialReply: mock.draft, getEditorialReply: mock.status, checkEditorialMailConnection: mock.connection, inspectEditorialSent: mock.status, repairEditorialSent: mock.draft,composeEditorialMail:mock.draft,syncEditorialDraft:mock.draft,getEditorialMailThread:mock.read,inspectEditorialDraft:mock.status }));
import { POST } from '@/app/api/editorial/mail/route';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
const request = (action: string, origin = 'https://ai.aproposmagazine.com') => new Request('https://ai.aproposmagazine.com/api/editorial/mail', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ action, input: { mailbox: 'frederik' } }) });
beforeEach(() => { vi.clearAllMocks(); mock.access = { uid: 'owner', owner: true, role: 'admin' }; mock.rate.mockResolvedValue(undefined); mock.search.mockResolvedValue({ messages: [] }); });
it('owner service reads have no publish/send scope and are private/no-store', async () => {
  const res = await POST(request('search')); expect(res.status).toBe(200); expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(mock.search).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ uid: 'owner', scopes: ['apropos:read', 'apropos:draft'] }), { mailbox: 'frederik' });
});
it.each(['send', 'confirm', 'confirm_editorial_reply', 'preview', 'constructor', '__proto__'])('rejects hidden send/approval or prototype action %s', async action => { expect((await POST(request(action))).status).toBe(400); expect(mock.search).not.toHaveBeenCalled(); });
it('denies anonymous/colleague and cross-origin requests', async () => {
  mock.access = null; expect((await POST(request('search'))).status).toBe(403);
  mock.access = { uid: 'colleague', owner: false, role: 'admin' }; expect((await POST(request('search'))).status).toBe(403);
  mock.access.owner = true; expect((await POST(request('search', 'https://evil.example'))).status).toBe(400); expect(mock.search).not.toHaveBeenCalled();
});
it.each(['frederik', 'liv'])('denies every first-party mail action for a non-owner admin: %s', async mailbox => {
  mock.access = { uid: 'colleague', owner: false, role: 'admin' };
  for (const action of ['search', 'read', 'draft', 'status', 'connection', 'inspect_sent', 'repair_sent','compose','sync_draft','thread','inspect_draft']) {
    const req = new Request('https://ai.aproposmagazine.com/api/editorial/mail', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://ai.aproposmagazine.com' },
      body: JSON.stringify({ action, input: { mailbox, uid: 'owner', owner: true } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  }
  for (const handler of [mock.search, mock.read, mock.draft, mock.status, mock.connection]) expect(handler).not.toHaveBeenCalled();
});
it('guards paid work and never leaks provider errors', async () => {
  mock.search.mockImplementation(() => assertPaidAiAllowed()); expect((await POST(request('search'))).status).toBe(400);
  mock.search.mockRejectedValue(Error('provider password SECRET')); expect(await (await POST(request('search'))).json()).toEqual({ error: 'mcp_mail_invalid_request' });
});
