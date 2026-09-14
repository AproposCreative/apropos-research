import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ get: vi.fn(), orderBy: vi.fn(), startAfter: vi.fn(), limit: vi.fn(), access: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ orderBy: m.orderBy }) }) }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
import { readDeliveryAlertHistory } from '@/lib/liv/alert-status';
import { GET } from '@/app/api/editorial/operations/alerts/route';
const request = (query = '') => new NextRequest('https://local/api/editorial/operations/alerts' + query);
beforeEach(() => {
  vi.resetAllMocks();
  const q = { startAfter: m.startAfter, limit: m.limit, get: m.get };
  m.orderBy.mockReturnValue(q); m.startAfter.mockReturnValue(q); m.limit.mockReturnValue(q);
  m.get.mockResolvedValue({ docs: [] });
});
it('paginates by day without exposing payloads or omitting uncertain historical records', async () => {
  m.get.mockResolvedValue({ docs: Array.from({ length: 21 }, (_, i) => ({
    id: `2026-08-${String(31-i).padStart(2,'0')}`, data: () => ({ day: `2026-08-${String(31-i).padStart(2,'0')}`, failure: { startedAt: 1, payload: 'private' } }),
  })) });
  const page = await readDeliveryAlertHistory(undefined, new Date('2026-09-14'));
  expect(page.records).toHaveLength(20); expect(page.nextCursor).toBe('2026-08-12');
  expect(page.records[0]).toEqual({ day: '2026-08-31', status: 'reconciliation_required' });
  expect(JSON.stringify(page)).not.toContain('private'); expect(m.limit).toHaveBeenCalledWith(21);
  expect(m.orderBy).toHaveBeenCalledWith('day', 'desc');
  m.get.mockResolvedValue({ docs: [] });
  expect(await readDeliveryAlertHistory(page.nextCursor!)).toEqual({ records: [], nextCursor: null });
  expect(m.startAfter).toHaveBeenCalledWith('2026-08-12');
});
it('rejects a mismatched sorting day instead of silently misordering history', async () => {
  m.get.mockResolvedValue({ docs: [{ id: '2026-09-13', data: () => ({ day: '2026-09-12' }) }] });
  await expect(readDeliveryAlertHistory()).rejects.toThrow('invalid_alert_record');
});
it('denies colleagues before querying even without middleware', async () => {
  m.access.mockResolvedValue({ owner: false, role: 'admin' });
  expect((await GET(request())).status).toBe(403); expect(m.get).not.toHaveBeenCalled();
});
it.each(['?cursor=bad','?cursor=2026-02-30','?cursor=2026-09-01&cursor=2026-09-02','?limit=10000'])('rejects invalid parameters %s', async query => {
  m.access.mockResolvedValue({ owner: true }); expect((await GET(request(query))).status).toBe(400); expect(m.get).not.toHaveBeenCalled();
});
it('reports unavailable, not an empty successful list, on database failure', async () => {
  m.access.mockResolvedValue({ owner: true }); m.get.mockRejectedValue(new Error('private'));
  const result = await GET(request()); expect(result.status).toBe(503); expect(await result.text()).not.toContain('private');
});
it('returns private uncached owner history', async () => {
  m.access.mockResolvedValue({ owner: true }); const result = await GET(request());
  expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('private, no-store');
});
