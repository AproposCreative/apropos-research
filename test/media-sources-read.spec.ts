import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ uid: vi.fn(), get: vi.fn(), where: vi.fn(), batch: vi.fn() }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: m.uid }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ where: m.where }), batch: m.batch }) }));
import { GET } from '@/app/api/media-sources/route';
beforeEach(() => { vi.resetAllMocks(); m.uid.mockResolvedValue('owner'); m.where.mockReturnValue({ get: m.get }); });
it('does not seed or substitute defaults for an empty personal list', async () => {
  m.get.mockResolvedValue({ empty: true, docs: [] });
  const r = await GET(new NextRequest('https://studio.test/api/media-sources'));
  expect(r.status).toBe(200); expect((await r.json()).data.sources).toEqual([]);
  expect(m.where).toHaveBeenCalledWith('userId', '==', 'owner'); expect(m.batch).not.toHaveBeenCalled();
  expect(r.headers.get('cache-control')).toBe('private, no-store');
});
it('reports storage errors, not successful defaults', async () => {
  m.get.mockRejectedValue(new Error('offline'));
  expect((await GET(new NextRequest('https://studio.test/api/media-sources'))).status).toBe(503);
});
it('requires authentication', async () => {
  m.uid.mockResolvedValue(null);
  expect((await GET(new NextRequest('https://studio.test/api/media-sources'))).status).toBe(401);
  expect(m.where).not.toHaveBeenCalled();
});
