import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ access: vi.fn(), get: vi.fn(), set: vi.fn(), create: vi.fn(), paths: [] as string[] }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mock.access }));
vi.mock('@/lib/firebase-admin', () => {
  const collection = (path: string) => ({ doc: (id: string) => { const full = `${path}/${id}`; mock.paths.push(full);
    return { path: full, collection: (name: string) => collection(`${full}/${name}`) }; } });
  return { getAdminDb: () => ({ collection, runTransaction: (fn: (tx: unknown) => unknown) => fn({ get: mock.get, set: mock.set, create: mock.create }) }) };
});
import { POST } from '@/app/api/writer/workspace/restore/route';
const data = { messages: [], chatTitle: 'Tidligere', articleData: {}, notes: 'old', showWizard: false, currentDraftId: 'old-draft' };
const current = { revision: 7, updatedAt: '2026-09-13', data: { ...data, notes: 'server current' } };
const selected = { revision: 3, updatedAt: '2026-09-12', data };
const body = { operationId: '35d1cd65-96a5-455f-8147-004578067ec1', revision: 7,
  selection: { kind: 'history', id: '3' }, local: { ...data, notes: 'unsaved local' } };
const req = (value: unknown = body) => new NextRequest('https://studio.test/api/writer/workspace/restore?userId=someone-else', { method: 'POST', body: JSON.stringify(value) });
beforeEach(() => {
  vi.resetAllMocks(); mock.paths.length = 0; mock.access.mockResolvedValue({ uid: 'actual', owner: true });
  mock.get.mockImplementation(async ({ path }: { path: string }) => {
    const value = path.endsWith('/actual') ? current : path.endsWith('/history/3') ? selected : undefined;
    return { exists: !!value, data: () => value };
  });
});
it('atomically preserves both versions and restores to a new draft identity', async () => {
  const response = await POST(req()); const result = await response.json();
  expect(response.status).toBe(200); expect(result.workspace.data.notes).toBe('old');
  expect(result.workspace.data.currentDraftId).toBe(`restored-${body.operationId}`);
  expect(result.workspace.revision).toBe(8);
  expect(mock.set).toHaveBeenCalledWith({ path: 'writerWorkspaces/actual/history/7', collection: expect.any(Function) }, current);
  expect(mock.set.mock.calls.some(([ref, value]) => ref.path.includes('/conflicts/') && value.data.notes === 'unsaved local')).toBe(true);
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(mock.paths.every(path => path.startsWith('writerWorkspaces/actual'))).toBe(true);
});
it('copies a shared snapshot into own workspace without writing the share or sender', async () => {
  const shareId = 'a'.repeat(64);
  mock.get.mockImplementation(async ({ path }: { path: string }) => {
    const value = path === `writerWorkspaceShares/${shareId}` ? { participants: ['sender', 'actual'], snapshot: selected }
      : path.endsWith('/actual') ? current : undefined;
    return { exists: !!value, data: () => value };
  });
  const response = await POST(req({ ...body, selection: { kind: 'shared', id: shareId } }));
  expect(response.status).toBe(200);
  expect((await response.json()).workspace.data.currentDraftId).toBe(`restored-${body.operationId}`);
  expect(mock.set.mock.calls.every(([ref]) => ref.path.startsWith('writerWorkspaces/actual'))).toBe(true);
  expect(mock.create.mock.calls.every(([ref]) => ref.path.startsWith('writerWorkspaces/actual'))).toBe(true);
  expect(mock.set.mock.calls.some(([ref, value]) => ref.path.includes('/conflicts/') && value.data.notes === 'unsaved local')).toBe(true);
});
it('denies copying an unshared snapshot even to Frederik', async () => {
  mock.get.mockImplementation(async ({ path }: { path: string }) => {
    const value = path.startsWith('writerWorkspaceShares/') ? { participants: ['sender', 'someone-else'], snapshot: selected }
      : path.endsWith('/actual') ? current : undefined;
    return { exists: !!value, data: () => value };
  });
  expect((await POST(req({ ...body, selection: { kind: 'shared', id: 'b'.repeat(64) } }))).status).toBe(404);
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
});
it('returns the saved receipt on retry without restoring twice', async () => {
  const first = await (await POST(req())).json();
  const receipt = mock.create.mock.calls[0][1]; mock.set.mockClear(); mock.create.mockClear();
  mock.get.mockResolvedValue({ exists: true, data: () => receipt });
  expect(await (await POST(req())).json()).toEqual(first);
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
});
it('rejects reuse of an operation ID for different content', async () => {
  await POST(req()); const receipt = mock.create.mock.calls[0][1]; mock.set.mockClear();
  mock.get.mockResolvedValue({ exists: true, data: () => receipt });
  expect((await POST(req({ ...body, local: data }))).status).toBe(409); expect(mock.set).not.toHaveBeenCalled();
});
it('does not overwrite a concurrently changed workspace', async () => {
  expect((await POST(req({ ...body, revision: 6 }))).status).toBe(409);
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
});
it('rejects forged ownership, path traversal and oversized local work', async () => {
  for (const bad of [{ ...body, uid: 'milo' }, { ...body, selection: { kind: 'history', id: '../other' } }]) {
    expect((await POST(req(bad))).status).toBe(400);
  }
  expect((await POST(req({ ...body, local: { ...data, notes: 'x'.repeat(500001) } }))).status).toBe(413);
  expect(mock.get).not.toHaveBeenCalled();
});
it('denies unauthenticated callers before database access', async () => {
  mock.access.mockResolvedValue(null); expect((await POST(req())).status).toBe(401); expect(mock.get).not.toHaveBeenCalled();
});
it('reports missing versions and sanitizes storage errors', async () => {
  expect((await POST(req({ ...body, selection: { kind: 'history', id: '99' } }))).status).toBe(404);
  mock.get.mockRejectedValue(new Error('secret upstream details'));
  const response = await POST(req()); expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('secret'); expect(mock.set).not.toHaveBeenCalled();
});
