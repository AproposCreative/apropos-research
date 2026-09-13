import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ verify: vi.fn(), collection: vi.fn(), set: vi.fn(), commit: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ EDITORIAL_ACCESS_COLLECTION: 'editorialAccess', verifyEditorialToken: m.verify }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: m.collection,
  batch: () => ({ set: m.set, commit: m.commit }) }) }));
import { GET, PUT } from '@/app/api/admin/access/route';
const request = (body?: unknown, token = 'fixture') => new NextRequest('https://studio.example/api/admin/access', {
  method: body === undefined ? 'GET' : 'PUT', headers: token ? { Authorization: `Bearer ${token}` } : {},
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeEach(() => {
  vi.resetAllMocks(); m.verify.mockResolvedValue({ uid: 'admin-fixture', role: 'admin' });
  m.collection.mockImplementation(name => ({ doc: (id = 'audit-fixture') => ({ path: `${name}/${id}` }), get: m.list }));
  m.commit.mockResolvedValue(undefined); m.list.mockResolvedValue({ docs: [] });
});
it.each([null, { uid: 'editor-fixture', role: 'editor' }])('denies listing and changes without admin role: %j', async role => {
  m.verify.mockResolvedValue(role);
  expect((await GET(request())).status).toBe(403);
  expect((await PUT(request({ email: 'guest@example.com', active: true, role: 'admin' }))).status).toBe(403);
  expect(m.collection).not.toHaveBeenCalled(); expect(m.commit).not.toHaveBeenCalled();
});
it('denies anonymous access before token verification or storage', async () => {
  expect((await GET(request(undefined, ''))).status).toBe(403);
  expect(m.verify).not.toHaveBeenCalled(); expect(m.collection).not.toHaveBeenCalled();
});
it.each(['editor', 'admin'])('writes normalized membership and audit atomically for %s', async role => {
  const r = await PUT(request({ email: ' Guest@Example.com ', active: true, role, updatedBy: 'forged' }));
  expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('no-store');
  expect(m.set).toHaveBeenCalledTimes(2);
  expect(m.set.mock.calls[0]).toEqual([{ path: 'editorialAccess/guest@example.com' },
    { active: true, role, updatedBy: 'admin-fixture', updatedAt: expect.any(String) }]);
  expect(m.set.mock.calls[1]).toEqual([{ path: 'editorialAccessAudit/audit-fixture' },
    { email: 'guest@example.com', ...m.set.mock.calls[0][1] }]);
  expect(m.commit).toHaveBeenCalledOnce();
});
it('records suspension without deleting the audit trail', async () => {
  expect((await PUT(request({ email: 'guest@example.com', active: false, role: 'editor' }))).status).toBe(200);
  expect(m.set.mock.calls[0][1]).toMatchObject({ active: false, updatedBy: 'admin-fixture' });
  expect(m.set).toHaveBeenCalledTimes(2); expect(m.commit).toHaveBeenCalledOnce();
});
it.each([{ email: 'bad', active: true, role: 'editor' }, { email: 'guest@example.com', active: 'true', role: 'editor' },
  { email: 'guest@example.com', active: true, role: 'owner' }])('rejects invalid membership before writes', async input => {
  expect((await PUT(request(input))).status).toBe(400); expect(m.commit).not.toHaveBeenCalled();
});
it('lists entries uncached only to administrators', async () => {
  m.list.mockResolvedValue({ docs: [{ id: 'guest@example.com', data: () => ({ active: true, role: 'editor' }) }] });
  const r = await GET(request()); expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('no-store');
  expect(await r.json()).toEqual({ entries: [{ email: 'guest@example.com', active: true, role: 'editor' }] });
});
