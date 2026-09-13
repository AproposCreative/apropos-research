import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ uid: vi.fn(), get: vi.fn(), update: vi.fn(), set: vi.fn(), check: vi.fn() }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: m.uid }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => ({ get: m.get, update: m.update, set: m.set }) }) }) }));
vi.mock('@/lib/media-source-check-cache', () => ({ checkMediaSource: m.check }));
import { POST, PUT } from '@/app/api/media-sources/route';
const source = { id: 'own-source', userId: 'owner', name: 'Source', baseUrl: 'https://source.example', sitemapIndex: '/sitemap.xml', enabled: true };
const request = (data: object, method = 'PUT') => new NextRequest('https://studio.test/api/media-sources?id=own-source', { method, body: JSON.stringify(data) });
beforeEach(() => {
  vi.resetAllMocks(); m.uid.mockResolvedValue('owner');
  m.get.mockResolvedValue({ exists: true, data: () => source });
  m.check.mockResolvedValue({});
});
it('persists disable and returns the saved state without fetching an unavailable publisher', async () => {
  m.check.mockRejectedValue(new Error('offline'));
  const response = await PUT(request({ ...source, enabled: false }));
  expect(response.status).toBe(200);
  expect((await response.json()).data.source.enabled).toBe(false);
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  expect(m.check).not.toHaveBeenCalled();
});
it('validates activation and does not write on failure', async () => {
  m.check.mockRejectedValue(new Error('offline'));
  expect((await PUT(request({ ...source, enabled: true }))).status).toBe(400);
  expect(m.update).not.toHaveBeenCalled();
});
it('does not bypass endpoint validation by disabling a changed URL', async () => {
  m.check.mockRejectedValue(new Error('unsafe'));
  expect((await PUT(request({ ...source, baseUrl: 'https://other.example', enabled: false }))).status).toBe(400);
  expect(m.update).not.toHaveBeenCalled();
});
it('preserves the saved choice when a legacy editor omits enabled', async () => {
  m.get.mockResolvedValue({ exists: true, data: () => ({ ...source, enabled: false }) });
  const { enabled, ...body } = source;
  expect((await PUT(request(body))).status).toBe(200);
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
});
it('rejects invalid toggle types', async () => {
  for (const value of ['false', null, 1]) {
    expect((await PUT(request({ ...source, enabled: value }))).status).toBe(400);
    expect((await POST(request({ ...source, enabled: value }, 'POST'))).status).toBe(400);
  }
  expect(m.update).not.toHaveBeenCalled(); expect(m.set).not.toHaveBeenCalled();
});
it('cannot change another users source', async () => {
  m.uid.mockResolvedValue('other');
  expect((await PUT(request({ ...source, enabled: false }))).status).toBe(403);
  expect(m.update).not.toHaveBeenCalled(); expect(m.check).not.toHaveBeenCalled();
});
it('stores the requested choice at creation after validation', async () => {
  m.get.mockResolvedValue({ exists: false });
  expect((await POST(request({ ...source, enabled: false }, 'POST'))).status).toBe(200);
  expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', enabled: false }));
  expect(m.check).toHaveBeenCalledOnce();
});
