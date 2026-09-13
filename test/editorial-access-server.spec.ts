import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), user: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: mocks.verify, getUser: mocks.user }),
  getAdminDb: () => ({ collection: () => ({ doc: () => ({ get: mocks.read }) }) }),
}));
import { verifyEditorialToken } from '@/lib/editorial-access';
beforeEach(() => {
  mocks.verify.mockReset().mockResolvedValue({ uid: 'external' });
  mocks.user.mockReset().mockResolvedValue({ uid: 'external', email: 'external@example.com', emailVerified: true });
  mocks.read.mockReset().mockResolvedValue({ exists: false });
});
it('rejects a valid Firebase user not approved by the editorial policy', async () => {
  expect(await verifyEditorialToken('token')).toBeNull();
  expect(mocks.verify).toHaveBeenCalledWith('token', true);
});
it('rereads approval for an existing token and respects revocation', async () => {
  mocks.read.mockResolvedValueOnce({ exists: true, data: () => ({ active: true, role: 'editor' }) });
  expect(await verifyEditorialToken('same-token')).toEqual({ uid: 'external', role: 'editor' });
  expect(await verifyEditorialToken('same-token')).toBeNull();
});
it('fails closed when Firebase is unavailable', async () => {
  mocks.read.mockRejectedValue(new Error('unavailable'));
  expect(await verifyEditorialToken('token')).toBeNull();
});
