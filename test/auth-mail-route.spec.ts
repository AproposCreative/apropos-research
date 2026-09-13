import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn(), user: vi.fn(), after: vi.fn() }));
vi.mock('next/server', () => ({ after: m.after }));
vi.mock('@/lib/auth-mail', () => ({ sendAuthMail: m.send }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: () => ({ verifyIdToken: m.verify, getUser: m.user }) }));
import { POST } from '@/app/api/auth/mail/route';
const request = (body: unknown, token = '', origin = 'https://app.test') => new Request('https://app.test/api/auth/mail', { method:'POST', headers:{origin, authorization:token}, body:JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); m.verify.mockResolvedValue({uid:'milo'}); m.user.mockResolvedValue({email:'milo@aproposmagazine.com',emailVerified:false}); });
it('uses fresh authenticated identity for verification, not a supplied recipient', async () => {
  expect((await POST(request({kind:'verify'}, 'Bearer fixture'))).status).toBe(200);
  expect(m.verify).toHaveBeenCalledWith('fixture',true);
  expect(m.send).toHaveBeenCalledWith('verify','milo@aproposmagazine.com');
  expect((await POST(request({kind:'verify',email:'frederik@aproposmagazine.com'},'Bearer fixture'))).status).toBe(400);
});
it('rejects absent/revoked tokens, disabled accounts and foreign origins', async () => {
  expect((await POST(request({kind:'verify'}))).status).toBe(401);
  m.verify.mockRejectedValueOnce(new Error('revoked'));
  expect((await POST(request({kind:'verify'},'Bearer fixture'))).status).toBe(401);
  m.user.mockResolvedValue({email:'milo@aproposmagazine.com',disabled:true});
  expect((await POST(request({kind:'verify'},'Bearer fixture'))).status).toBe(401);
  expect((await POST(request({kind:'reset',email:'x@example.com'},'','https://evil.test'))).status).toBe(403);
  expect(m.send).not.toHaveBeenCalled();
});
it('reset never reveals account existence or provider response', async () => {
  const first = await POST(request({kind:'reset',email:'outside@example.com'}));
  const log = vi.spyOn(console,'error').mockImplementation(()=>{});
  m.send.mockRejectedValueOnce(new Error('sensitive provider detail'));
  const second = await POST(request({kind:'reset',email:'milo@aproposmagazine.com'}));
  expect(second.status).toBe(first.status); expect(await second.json()).toEqual(await first.json());
  expect(m.send).not.toHaveBeenCalled();
  await m.after.mock.calls[1][0]();
  expect(m.send).toHaveBeenCalledWith('reset','milo@aproposmagazine.com');
  log.mockRestore();
});
