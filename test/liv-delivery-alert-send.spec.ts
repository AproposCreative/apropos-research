import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({row:null as any,send:vi.fn(),tail:Promise.resolve()}));
vi.mock('resend',()=>({Resend:class {emails={send:m.send};}}));
vi.mock('@/lib/firebase-admin',()=>({getAdminDb:()=>({collection:()=>({doc:()=>({update:async(p:any)=>{
 for(const [key,value] of Object.entries(p)){const [kind,field]=key.split('.');m.row[kind][field]=value;}
}})}),runTransaction:async(fn:any)=>{
 const previous=m.tail;let release!:()=>void;m.tail=new Promise<void>(r=>{release=r;});await previous;
 try{return await fn({get:async()=>({data:()=>structuredClone(m.row)}),set:(_:any,d:any)=>{m.row=structuredClone(d);}});}finally{release();}
}})}));
import { notifyDeliveryHealth } from '@/lib/liv/delivery-alerts';
import { emptyDeliveryState } from '@/lib/liv/delivery-policy';
beforeEach(()=>{vi.resetAllMocks();m.row=null;m.tail=Promise.resolve();vi.stubEnv('RESEND_API_KEY','fixture');vi.stubEnv('RESEND_FROM_EMAIL','fixture@example.com');m.send.mockResolvedValue({data:{id:'fixture'}});});
afterEach(()=>vi.unstubAllEnvs());
it('only one of simultaneous checks sends under serialized storage transactions',async()=>{
 const state=emptyDeliveryState();const now=new Date('2026-09-13T08:15:00Z');
 await Promise.all(Array.from({length:8},()=>notifyDeliveryHealth(state,now)));
 expect(m.send).toHaveBeenCalledTimes(1);expect(m.row.failure.accepted).toBe(true);expect(m.row.day).toBe('2026-09-13');
});
it('does not retry outside the provider deduplication window',async()=>{
 const state=emptyDeliveryState();m.send.mockRejectedValueOnce(new Error('unknown'));
 await expect(notifyDeliveryHealth(state,new Date('2026-09-13T08:15:00Z'))).rejects.toThrow();
 // Simulate a retained ambiguous operation that has exceeded the provider window.
 m.row.failure.startedAt=Date.parse('2026-09-12T08:00:00Z');m.row.failure.leaseUntil=0;
 await expect(notifyDeliveryHealth(state,new Date('2026-09-13T08:30:00Z'))).rejects.toThrow();
 expect(m.send).toHaveBeenCalledTimes(1);
});
it('retains the same provider identity and payload after uncertain failure',async()=>{
 const state=emptyDeliveryState();const now=new Date('2026-09-13T08:15:00Z');
 m.send.mockRejectedValueOnce(new Error('network'));
 await expect(notifyDeliveryHealth(state,now)).rejects.toThrow();
 await notifyDeliveryHealth(state,new Date('2026-09-13T08:16:00Z'));expect(m.send).toHaveBeenCalledTimes(1);
 await notifyDeliveryHealth(state,new Date('2026-09-13T08:30:00Z'));
 expect(m.send.mock.calls[1]).toEqual(m.send.mock.calls[0]);
 await notifyDeliveryHealth(state,new Date('2026-09-13T08:45:00Z'));expect(m.send).toHaveBeenCalledTimes(2);
});
it('does not send on a healthy day and sends only one resolution after an alarm',async()=>{
 const state=emptyDeliveryState();const now=new Date('2026-09-13T08:15:00Z');
 await notifyDeliveryHealth(state,now);
 state.slots['2026-09-13']={state:'published',itemId:'fixture',token:'fixture',leaseUntil:0,attempts:1,nextAttemptAt:0};
 await notifyDeliveryHealth(state,now);await notifyDeliveryHealth(state,now);
 expect(m.send).toHaveBeenCalledTimes(2);expect(m.row.resolved.accepted).toBe(true);
 m.row=null;m.send.mockClear();await notifyDeliveryHealth(state,now);expect(m.send).not.toHaveBeenCalled();
});
