import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), get: vi.fn(), list: vi.fn(), check: vi.fn(), set: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
vi.mock('@/lib/media-source-check-cache', () => ({ checkMediaSource: m.check }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({
  doc: () => ({ get: m.get }), limit: () => ({ get: m.list }),
}), runTransaction: m.transaction }) }));
import { GET, PUT } from '@/app/api/liv/media-sources/route';
const body = { name: 'Source', baseUrl: 'https://soundvenue.com', sitemapIndex: '/feed', enabled: true, revision: 0 };
const request = (patch = {}) => new Request('https://app.test/api/liv/media-sources', { method: 'PUT', body: JSON.stringify({ ...body, ...patch }) });
beforeEach(() => {
  vi.resetAllMocks(); m.access.mockResolvedValue({ uid: 'frederik', owner: true });
  m.get.mockResolvedValue({ data: () => undefined }); m.list.mockResolvedValue({ docs: [] });
  m.check.mockResolvedValue({ checkedAt: '2026-09-13', urlCount: 10 });
  m.transaction.mockImplementation(fn => fn({ get: m.get, set: m.set }));
});
it('rejects colleagues and missing identities on reads and writes', async () => {
  for (const [identity, status] of [[null, 401], [{ owner: false }, 403]] as const) {
    m.access.mockResolvedValue(identity);
    expect((await GET(request())).status).toBe(status);
    expect((await PUT(request())).status).toBe(status);
  }
  expect(m.check).not.toHaveBeenCalled(); expect(m.list).not.toHaveBeenCalled();
});
it('keeps empty reads empty with no network check or write', async () => {
  const response = await GET(request()); expect(await response.json()).toEqual({ sources: [] });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(m.check).not.toHaveBeenCalled(); expect(m.set).not.toHaveBeenCalled();
});
it('validates and writes the source without personal ownership', async () => {
  expect((await PUT(request())).status).toBe(200);
  expect(m.check).toHaveBeenCalledWith('frederik', body.baseUrl, '/feed', undefined);
  expect(m.set.mock.calls[0][1]).toMatchObject({ revision: 1, updatedBy: 'frederik', enabled: true });
  expect(m.set.mock.calls[0][1]).not.toHaveProperty('userId');
});
it('rejects stale revision before a network check', async () => {
  m.get.mockResolvedValue({ data: () => ({ revision: 2 }) });
  expect((await PUT(request())).status).toBe(409); expect(m.check).not.toHaveBeenCalled();
});
it('rejects an edit racing the validation', async () => {
  m.get.mockResolvedValueOnce({ data: () => undefined }).mockResolvedValue({ data: () => ({ revision: 1 }) });
  expect((await PUT(request())).status).toBe(409); expect(m.set).not.toHaveBeenCalled();
});
it('can disable an unavailable source without a network request', async () => {
  expect((await PUT(request({ enabled: false }))).status).toBe(200); expect(m.check).not.toHaveBeenCalled();
});
it('does not write after failed validation', async () => {
  m.check.mockRejectedValue(new Error('private diagnostic'));
  const response = await PUT(request()); expect(response.status).toBe(422);
  expect(await response.text()).not.toContain('private diagnostic'); expect(m.set).not.toHaveBeenCalled();
});
it('rejects unknown fields and unsafe URLs', async () => {
  expect((await PUT(request({ userId: 'milo' }))).status).toBe(400);
  expect((await PUT(request({ baseUrl: 'http://localhost' }))).status).toBe(400);
  expect(m.set).not.toHaveBeenCalled();
});
