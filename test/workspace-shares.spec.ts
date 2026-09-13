import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), recipient: vi.fn(), docs: new Map<string, any>(), create: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
function ref(path: string): any { return { path, doc: (id: string) => ref(`${path}/${id}`), get: async () => ({ data: () => m.docs.get(path) }) }; }
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: () => ({ getUserByEmail: m.recipient }), getAdminDb: () => ({ collection: ref,
  runTransaction: (fn: any) => fn({ get: async (r: any) => ({ data: () => m.docs.get(r.path) }),
    create: (r: any, data: any) => { m.create(r.path, data); m.docs.set(r.path, structuredClone(data)); } }),
}) }));
import { GET, POST } from '@/app/api/writer/workspace/shares/route';
const body = { operationId: '1699e4b7-ed34-4453-8bd5-23854a98437a', revision: 1, recipient: 'milo@aproposmagazine.com' };
const request = (patch = {}) => new Request('https://app.test/api/writer/workspace/shares', { method: 'POST', body: JSON.stringify({ ...body, ...patch }) });
const detail = (id: string) => new Request(`https://app.test/api/writer/workspace/shares?id=${id}`);
beforeEach(() => {
  vi.clearAllMocks(); m.docs.clear(); m.access.mockResolvedValue({ uid: 'casper', owner: false });
  m.recipient.mockResolvedValue({ uid: 'milo', email: body.recipient, emailVerified: true, disabled: false });
  m.docs.set('writerWorkspaces/casper', { revision: 1, updatedAt: 'today', data: { messages: [], chatTitle: 'Privat kladde', articleData: { content: 'Første version' }, notes: '', showWizard: false, currentDraftId: 'draft' } });
});
it('copies only the authenticated user’s exact version and keeps it immutable', async () => {
  const response = await POST(request()); expect(response.status).toBe(201); const { id } = await response.json();
  m.docs.get('writerWorkspaces/casper').data.articleData.content = 'Senere privat ændring';
  m.access.mockResolvedValue({ uid: 'milo' });
  const shared = await (await GET(detail(id))).json(); expect(shared.share.snapshot.data.articleData.content).toBe('Første version');
});
it('denies Frederik access unless he is a participant', async () => {
  const { id } = await (await POST(request())).json(); m.access.mockResolvedValue({ uid: 'frederik', owner: true });
  expect((await GET(detail(id))).status).toBe(404);
});
it('does not duplicate an identical operation or overwrite on changed revision', async () => {
  const first = await (await POST(request())).json(); const second = await (await POST(request())).json();
  expect(second.id).toBe(first.id); expect(m.create).toHaveBeenCalledTimes(1);
  expect((await POST(request({ revision: 2 }))).status).toBe(409);
});
it('rejects stale versions, forged owner, non-team and unverified recipients', async () => {
  expect((await POST(request({ revision: 2 }))).status).toBe(409);
  expect((await POST(request({ ownerUid: 'frederik' }))).status).toBe(400);
  expect((await POST(request({ recipient: 'outside@example.com' }))).status).toBe(400);
  m.recipient.mockResolvedValue({ uid: 'milo', email: body.recipient, emailVerified: false });
  expect((await POST(request())).status).toBe(400); expect(m.create).not.toHaveBeenCalled();
});
it('requires authentication for reads and writes', async () => {
  m.access.mockResolvedValue(null); expect((await GET(detail('a'.repeat(64)))).status).toBe(401);
  expect((await POST(request())).status).toBe(401);
});
