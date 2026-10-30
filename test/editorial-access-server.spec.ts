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
  mocks.user.mockResolvedValue({ uid: 'external', email: 'milo@aproposmagazine.com', emailVerified: true });
  mocks.read.mockResolvedValueOnce({ exists: true, data: () => ({ active: true, role: 'editor' }) });
  mocks.read.mockResolvedValueOnce({ exists: true, data: () => ({ active: false, role: 'editor' }) });
  expect(await verifyEditorialToken('same-token')).toEqual({ uid: 'external', role: 'editor', owner: false });
  expect(await verifyEditorialToken('same-token')).toBeNull();
});
it('fails closed when Firebase is unavailable', async () => {
  mocks.read.mockRejectedValue(new Error('unavailable'));
  expect(await verifyEditorialToken('token')).toBeNull();
});
it.each(['frederik.emil.kragh@gmail.com','frederik@aproposcreative.com'])('accepts the verified owner alias %s with canonical role and original UID', async email => {
  mocks.user.mockResolvedValue({uid:'existing-google-uid',email,emailVerified:true});
  mocks.read.mockResolvedValueOnce({exists:false}).mockResolvedValueOnce({exists:true,data:()=>({active:true,role:'admin'})});
  expect(await verifyEditorialToken('verified-token')).toEqual({uid:'existing-google-uid',role:'admin',owner:true});
});
it.each(['alias','canonical'])('rejects the alias when %s access has been suspended', async target => {
  mocks.user.mockResolvedValue({uid:'existing-google-uid',email:'frederik@aproposcreative.com',emailVerified:true});
  mocks.read.mockResolvedValueOnce({exists:true,data:()=>({active:target!=='alias',role:'admin'})})
    .mockResolvedValueOnce({exists:true,data:()=>({active:target!=='canonical',role:'admin'})});
  expect(await verifyEditorialToken('verified-token')).toBeNull();
});
