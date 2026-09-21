import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.access }));
vi.mock('@/lib/ai/cost-actions', () => ({ readCostActions: m.read }));
import { GET } from '@/app/api/ai-cost/actions/route';
beforeEach(() => { vi.resetAllMocks(); m.read.mockResolvedValue({ actions: [], billedDkk: null }); });
it.each([null, { owner: false }])('rejects unauthenticated and non-owner requests before reading', async access => {
  m.access.mockResolvedValue(access);
  expect((await GET(new NextRequest('https://app.example/api/ai-cost/actions'))).status).toBe(403);
  expect(m.read).not.toHaveBeenCalled();
});
it('validates month and returns private owner-only data', async () => {
  m.access.mockResolvedValue({ owner: true });
  expect((await GET(new NextRequest('https://app.example/api/ai-cost/actions?month=2026-13'))).status).toBe(400);
  expect(m.read).not.toHaveBeenCalled();
  const r = await GET(new NextRequest('https://app.example/api/ai-cost/actions?month=2026-09'));
  expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(m.read).toHaveBeenCalledWith('2026-09');
});
it('hides infrastructure failures', async () => {
  m.access.mockResolvedValue({ owner: true }); m.read.mockRejectedValue(Error('secret'));
  const r = await GET(new NextRequest('https://app.example/api/ai-cost/actions'));
  expect(r.status).toBe(503); expect(await r.text()).not.toContain('secret');
});
