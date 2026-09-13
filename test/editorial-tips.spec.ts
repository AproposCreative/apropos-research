import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), create: vi.fn(), rows: vi.fn(), get: vi.fn(), docs: new Map<string, any>() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: () => ({ doc: (id: string) => id, orderBy: () => ({ limit: () => ({ get: m.rows }) }) }),
  runTransaction: (fn: any) => fn({ get: async (id: string) => ({ exists: m.docs.has(id), data: () => m.docs.get(id) }),
    create: (id: string, data: any) => { m.create(id, data); m.docs.set(id, data); } }),
}) }));
import { GET, POST } from '@/app/api/editorial/tips/route';
import { requiresEditorialOwner } from '@/lib/editorial-capabilities';
const payload = { operationId: 'b8f780e8-1f23-4c67-9db1-bca4c2a5a982', url: 'https://soundvenue.com/story', angle: 'En ny kulturel vinkel her' };
const request = (patch = {}) => new Request('https://app.test/api/editorial/tips', { method: 'POST', body: JSON.stringify({ ...payload, ...patch }) });
beforeEach(() => { vi.clearAllMocks(); m.docs.clear(); m.access.mockResolvedValue({ uid: 'casper', owner: false }); m.rows.mockResolvedValue({ docs: [] }); });
it('allows verified colleagues to submit, with no owner-only middleware gate', async () => {
  expect(requiresEditorialOwner('/api/editorial/tips', 'POST')).toBe(false);
  expect((await POST(request())).status).toBe(201);
  expect(m.create.mock.calls[0][1]).toMatchObject({ submittedBy: 'casper', status: 'proposed' });
});
it('returns the same receipt without duplicating a retried tip', async () => {
  const first = await (await POST(request())).json(); const second = await (await POST(request())).json();
  expect(second.id).toBe(first.id); expect(second.created).toBe(false); expect(m.create).toHaveBeenCalledTimes(1);
});
it('rejects a changed payload with an existing operation ID', async () => {
  await POST(request()); expect((await POST(request({ angle: 'En anden vinkel på historien' }))).status).toBe(409);
  expect(m.create).toHaveBeenCalledTimes(1);
});
it('scopes receipt identities to the authenticated user', async () => {
  const first = await (await POST(request())).json(); m.access.mockResolvedValue({ uid: 'milo' });
  const second = await (await POST(request())).json(); expect(first.id).not.toBe(second.id);
});
it('requires authentication on both handlers', async () => {
  m.access.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401); expect((await POST(request())).status).toBe(401);
  expect(m.create).not.toHaveBeenCalled();
});
it('rejects forged ownership and unsafe or oversized input', async () => {
  expect((await POST(request({ submittedBy: 'frederik' }))).status).toBe(400);
  expect((await POST(request({ url: 'javascript:alert(1)' }))).status).toBe(400);
  expect((await POST(request({ angle: 'a'.repeat(7000) }))).status).toBe(413);
});
it('returns only shared display fields, not receipt data', async () => {
  m.rows.mockResolvedValue({ docs: [{ id: 'id', data: () => ({ ...payload, status: 'proposed', submittedBy: 'private-uid', digest: 'internal', createdAt: 'today' }) }] });
  const response = await GET(request()); const data = await response.json();
  expect(data.tips[0]).not.toHaveProperty('submittedBy'); expect(data.tips[0]).not.toHaveProperty('digest');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
