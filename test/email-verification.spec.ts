import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
const sdk = vi.hoisted(() => ({ reload: vi.fn(), sendEmailVerification: vi.fn() }));
vi.mock('firebase/auth', () => sdk);
import { createEmailVerificationActions } from '@/lib/email-verification';

describe('email verification actions', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  function fixture() {
    const user = { uid: 'fixture', emailVerified: false, getIdToken: vi.fn().mockResolvedValue('fixture-token') } as unknown as User;
    const current = { user: user as User | null };
    const access = vi.fn().mockResolvedValue(undefined);
    return { user, current, access, actions: createEmailVerificationActions(() => current.user, access) };
  }
  it('does not send on creation and prevents immediate repeated sends', async () => {
    const f = fixture();
    expect(sdk.sendEmailVerification).not.toHaveBeenCalled();
    await f.actions.sendVerification();
    await expect(f.actions.sendVerification()).rejects.toThrow('Vent et minut');
    expect(sdk.sendEmailVerification).toHaveBeenCalledTimes(1);
  });
  it('does not grant access to an unverified user', async () => {
    const f = fixture();
    await expect(f.actions.checkVerification()).rejects.toThrow('ikke verificeret');
    expect(f.access).not.toHaveBeenCalled();
    expect(f.user.getIdToken).not.toHaveBeenCalled();
  });
  it('refreshes token then still requires server authorization', async () => {
    const f = fixture();
    sdk.reload.mockImplementation(async () => { Object.assign(f.user, { emailVerified: true }); });
    f.access.mockRejectedValue(new Error('denied'));
    await expect(f.actions.checkVerification()).rejects.toThrow('denied');
    expect(f.user.getIdToken).toHaveBeenCalledWith(true);
    expect(f.access).toHaveBeenCalledWith(f.user);
  });
  it('stops if the account changes while reloading', async () => {
    const f = fixture();
    sdk.reload.mockImplementation(async () => { f.current.user = null; });
    await expect(f.actions.checkVerification()).rejects.toThrow('Kontoen er ændret');
    expect(f.access).not.toHaveBeenCalled();
  });
  it('allows retry after a failed send', async () => {
    const f = fixture();
    sdk.sendEmailVerification.mockRejectedValueOnce(new Error('network'));
    await expect(f.actions.sendVerification()).rejects.toThrow('network');
    await f.actions.sendVerification();
    expect(sdk.sendEmailVerification).toHaveBeenCalledTimes(2);
  });
});
