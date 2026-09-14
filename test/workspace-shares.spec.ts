import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), db: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: m.db }));
import { GET, POST } from '@/app/api/writer/workspace/shares/route';
const detail = () => new Request('https://app.test/api/writer/workspace/shares?id=' + 'a'.repeat(64));
beforeEach(() => {
  vi.clearAllMocks(); m.access.mockResolvedValue({ uid: 'casper' });
  m.db.mockReturnValue({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({
    ownerUid: 'casper', participants: ['casper','milo'], createdAt: '2026-09-13',
    snapshot: { data: { articleData: { content: 'Historisk kopi' } } },
  }) }) }) }) });
});
it.each(['casper','milo','frederik'])('denies new sharing by %s without database access', async uid => {
  m.access.mockResolvedValue({ uid, owner: uid === 'frederik' });
  const response = await POST(detail());
  expect(response.status).toBe(410);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect((await response.json()).error).toContain('Webflow');
  expect(m.db).not.toHaveBeenCalled();
});
it.each(['casper','milo'])('retains historical copy for participant %s', async uid => {
  m.access.mockResolvedValue({ uid });
  const response = await GET(detail());
  expect(response.status).toBe(200);
  expect((await response.json()).share.snapshot.data.articleData.content).toBe('Historisk kopi');
});
it('denies owner access to other participants’ historical copy', async () => {
  m.access.mockResolvedValue({ uid: 'frederik', owner: true });
  expect((await GET(detail())).status).toBe(404);
});
it('requires authentication on both operations', async () => {
  m.access.mockResolvedValue(null);
  expect((await GET(detail())).status).toBe(401);
  expect((await POST(detail())).status).toBe(401);
  expect(m.db).not.toHaveBeenCalled();
});
