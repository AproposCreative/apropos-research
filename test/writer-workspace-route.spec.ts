import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ verify: vi.fn(), get: vi.fn(), set: vi.fn(), create: vi.fn(), doc: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ verifyEditorialToken: m.verify }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: () => ({ doc: m.doc }),
  runTransaction: (run: (tx: unknown) => unknown) => run({ get: m.get, set: m.set, create: m.create }),
}) }));
import { GET, PUT } from '@/app/api/writer/workspace/route';
const data = { messages: [], chatTitle: 'Min kladde', articleData: {}, notes: 'privat', showWizard: true, currentDraftId: 'draft-1' };
const req = (body?: unknown) => new NextRequest('https://studio.test/api/writer/workspace?userId=forged', {
  method: body === undefined ? 'GET' : 'PUT', headers: { Authorization: 'Bearer fixture' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeEach(() => {
  vi.resetAllMocks(); m.verify.mockResolvedValue({ uid: 'actual-user', owner: false, role: 'editor' });
  m.get.mockResolvedValue({ exists: false, data: () => undefined });
  m.doc.mockImplementation((id: string) => ({ id, get: m.get, collection: () => ({ doc: (id: string) => ({ id }) }) }));
});
it('loads only the verified user, ignoring query ownership', async () => {
  expect((await GET(req())).status).toBe(200);
  expect(m.doc).toHaveBeenCalledWith('actual-user');
});
it('denies unauthenticated reads and writes before database access', async () => {
  m.verify.mockResolvedValue(null);
  expect((await GET(req())).status).toBe(401);
  expect((await PUT(req({ revision: 0, data }))).status).toBe(401);
  expect(m.doc).not.toHaveBeenCalled();
});
it('saves a new revision', async () => {
  const r = await PUT(req({ revision: 0, data }));
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ revision: 1 });
  expect(m.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ revision: 1, data }));
});
it('preserves conflicting content without overwriting the existing version', async () => {
  m.get.mockResolvedValueOnce({ data: () => ({ revision: 3, data: { ...data, notes: 'other device' } }) });
  const r = await PUT(req({ revision: 1, data }));
  expect(r.status).toBe(409); expect(m.set).not.toHaveBeenCalled();
  expect(m.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data, revision: 1 }));
});
it('does not create a revision for an identical retry', async () => {
  m.get.mockResolvedValue({ data: () => ({ revision: 3, data }) });
  expect((await PUT(req({ revision: 2, data }))).status).toBe(200);
  expect(m.set).not.toHaveBeenCalled();
});
it('rejects injected ownership and oversized payloads', async () => {
  expect((await PUT(req({ revision: 0, data, userId: 'forged' }))).status).toBe(400);
  expect((await PUT(req({ revision: 0, data: { ...data, notes: 'a'.repeat(500001) } }))).status).toBe(413);
  expect(m.doc).not.toHaveBeenCalled();
});
