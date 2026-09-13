import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ verifyEditorialToken: mocks.auth }));
vi.mock('@/lib/editorial-operations', () => ({ readEditorialOperations: mocks.read }));
import * as route from '@/app/api/editorial/operations/route';
beforeEach(() => { vi.resetAllMocks(); });
it('denies anonymous or unapproved users before reading operations', async () => {
  for (const headers of [{}, { authorization: 'Bearer denied' }]) {
    expect((await route.GET(new NextRequest('https://test/api/editorial/operations', { headers }))).status).toBe(403);
  }
  expect(mocks.read).not.toHaveBeenCalled();
});
it.each(['editor', 'admin'])('denies a colleague with role %s directly without middleware', async role => {
  mocks.auth.mockResolvedValue({ uid: 'colleague', role, owner: false });
  expect((await route.GET(new NextRequest('https://test/api/editorial/operations', { headers: { authorization: 'Bearer colleague' } }))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it('returns read-only noncached status for the verified owner', async () => {
  mocks.auth.mockResolvedValue({ uid: 'test', role: 'editor', owner: true });
  mocks.read.mockResolvedValue({ liv: { available: false }, newsletter: { available: true } });
  const result = await route.GET(new NextRequest('https://test/api/editorial/operations', { headers: { authorization: 'Bearer approved' } }));
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('private, no-store');
  expect(route).not.toHaveProperty('POST');
  expect(route).not.toHaveProperty('PATCH');
});
