import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ docs:new Map<string,any>(), user:vi.fn(), link:vi.fn(), send:vi.fn() }));
const ref = (path:string):any => ({path,doc:(id:string)=>ref(`${path}/${id}`),get:async()=>({data:()=>m.docs.get(path)}),set:async(d:any)=>{m.docs.set(path,d);},update:async(d:any)=>{m.docs.set(path,{...m.docs.get(path),...d});}});
vi.mock('@/lib/firebase-admin',()=>({getAdminAuth:()=>({getUserByEmail:m.user,generateEmailVerificationLink:m.link,generatePasswordResetLink:m.link}),getAdminDb:()=>({collection:ref,runTransaction:async(fn:any)=>fn({get:async(r:any)=>r.get(),set:(r:any,d:any)=>r.set(d)})})}));
vi.mock('resend',()=>({Resend:class { emails={send:m.send}; }}));
import { reserveAuthMail, sendAuthMail } from '@/lib/auth-mail';
beforeEach(()=>{vi.resetAllMocks();m.docs.clear();process.env.RESEND_API_KEY='fixture';process.env.RESEND_FROM_EMAIL='fixture@example.com';m.user.mockResolvedValue({emailVerified:false});m.link.mockResolvedValue('https://fixture.test/action?secret=fixture');m.send.mockResolvedValue({data:{id:'fixture-message'}});});
it('sends a Firebase link without marking account verified or storing link',async()=>{
 await sendAuthMail('verify','MILO@aproposmagazine.com');
 expect(m.send).toHaveBeenCalledTimes(1);
 expect(m.send.mock.calls[0][0].to).toBe('milo@aproposmagazine.com');
 expect(m.send.mock.calls[0][1].idempotencyKey).toMatch(/^auth-mail-/);
 expect(JSON.stringify([...m.docs])).not.toContain('secret=fixture');
 await sendAuthMail('verify','milo@aproposmagazine.com');expect(m.send).toHaveBeenCalledTimes(1);
});
it('skips outsiders, suspended accounts and verified verification recipients',async()=>{
 await sendAuthMail('reset','outside@example.com');expect(m.user).not.toHaveBeenCalled();
 m.user.mockResolvedValue({disabled:true});await sendAuthMail('reset','milo@aproposmagazine.com');
 m.user.mockResolvedValue({emailVerified:true});await sendAuthMail('verify','casper@aproposmagazine.com');expect(m.send).not.toHaveBeenCalled();
});
it('applies durable per-address and global limits',async()=>{
 expect(await reserveAuthMail('reset','milo@aproposmagazine.com')).toBeTruthy();
 expect(await reserveAuthMail('reset','milo@aproposmagazine.com')).toBeNull();
 m.docs.set('authMailLimits/global',{times:Array(30).fill(Date.now())});
 expect(await reserveAuthMail('verify','casper@aproposmagazine.com')).toBeNull();
});
it('records sanitized failure and never a successful delivery claim',async()=>{
 m.send.mockResolvedValue({error:{message:'private details'}});
 await expect(sendAuthMail('reset','milo@aproposmagazine.com')).rejects.toThrow('auth_mail_send_failed');
 expect([...m.docs.values()].some(d=>d.status==='failed')).toBe(true);
 expect(JSON.stringify([...m.docs])).not.toContain('private details');
});
