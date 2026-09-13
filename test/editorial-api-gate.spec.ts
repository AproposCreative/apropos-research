import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const verify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editorial-access', () => ({ verifyEditorialToken: verify }));
import { isApiRequestAuthorized } from '@/lib/api/middleware-auth';
afterEach(() => { vi.unstubAllEnvs(); verify.mockReset(); });
it('denies an unapproved token and prevents editor admin mutations', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const req = (path: string) => new NextRequest('https://example.com/api/' + path, { method: 'PUT', headers: { Authorization: 'Bearer user-token' } });
  verify.mockResolvedValue(null);
  expect(await isApiRequestAuthorized(req('webflow/publish'))).toBe(false);
  verify.mockResolvedValue({ uid: 'user', role: 'editor' });
  expect(await isApiRequestAuthorized(req('admin/access'))).toBe(false);
  verify.mockResolvedValue({ uid: 'user', role: 'admin' });
  expect(await isApiRequestAuthorized(req('admin/access'))).toBe(true);
});
it('preserves cron auth and public health without user lookups', async () => {
  vi.stubEnv('CRON_SECRET', 'test-cron');
  expect(await isApiRequestAuthorized(new NextRequest('https://example.com/api/cron/liv-daily', { headers: { Authorization: 'Bearer test-cron' } }))).toBe(true);
  expect(await isApiRequestAuthorized(new NextRequest('https://example.com/api/health'))).toBe(true);
  expect(verify).not.toHaveBeenCalled();
});
