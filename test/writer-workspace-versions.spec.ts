import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ access: vi.fn(), doc: vi.fn(), order: vi.fn(), limit: vi.fn(), get: vi.fn(), detail: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: mock.access }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: mock.doc }) }) }));
import { GET } from '@/app/api/writer/workspace/versions/route';
const data = { messages: [], chatTitle: 'Privat', articleData: {}, notes: 'mine', showWizard: false, currentDraftId: 'draft' };
beforeEach(() => {
  vi.resetAllMocks(); mock.access.mockResolvedValue({ uid: 'verified-user', owner: true });
  mock.doc.mockReturnValue({ collection: () => ({ orderBy: mock.order, doc: () => ({ get: mock.detail }) }) });
  mock.order.mockReturnValue({ limit: mock.limit }); mock.limit.mockReturnValue({ get: mock.get });
  mock.get.mockResolvedValue({ docs: [] }); mock.detail.mockResolvedValue({ exists: false });
});
const req = (query = '') => new NextRequest(`https://studio.test/api/writer/workspace/versions${query}`);
it('denies reads without verified access', async () => {
  mock.access.mockResolvedValue(null); expect((await GET(req())).status).toBe(401); expect(mock.doc).not.toHaveBeenCalled();
});
it('even the owner can only list his own versions, ignoring supplied user IDs', async () => {
  const response = await GET(req('?userId=milo'));
  expect(mock.doc).toHaveBeenCalledWith('verified-user'); expect(mock.limit).toHaveBeenCalledWith(20);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ versions: [], limitPerKind: 20 });
});
it.each(['?kind=users', '?kind=history&id=../milo', '?id=1', '?kind=conflicts&id=not-a-hash'])('rejects malformed selection %s', async query => {
  expect((await GET(req(query))).status).toBe(400); expect(mock.doc).not.toHaveBeenCalled();
});
it('lists metadata without sending every stored article', async () => {
  mock.get.mockResolvedValueOnce({ docs: [{ id: '3', data: () => ({ revision: 3, updatedAt: '2026-09-13', data }) }] });
  const body = await (await GET(req())).json();
  expect(body.versions).toEqual([{ id: '3', kind: 'history', title: 'Privat', updatedAt: '2026-09-13', revision: 3 }]);
  expect(JSON.stringify(body)).not.toContain('mine');
});
it('returns a selected conflict copy using its saved timestamp', async () => {
  mock.detail.mockResolvedValue({ exists: true, data: () => ({ revision: 2, savedAt: '2026-09-13', data }) });
  const body = await (await GET(req(`?kind=conflicts&id=${'a'.repeat(64)}`))).json();
  expect(body.snapshot).toEqual({ revision: 2, updatedAt: '2026-09-13', data });
});
it('keeps missing versions and storage failure distinct without leaking details', async () => {
  expect((await GET(req('?kind=history&id=1'))).status).toBe(404);
  mock.get.mockRejectedValue(new Error('private service error'));
  const response = await GET(req()); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Versionerne kunne ikke hentes. Intet er ændret.' });
});
