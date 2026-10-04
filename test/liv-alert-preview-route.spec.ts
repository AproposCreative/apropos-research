import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m=vi.hoisted(()=>({access:vi.fn(),state:vi.fn(),context:vi.fn()}));
vi.mock('@/lib/editorial-access',()=>({editorialRequestAccess:m.access}));
vi.mock('@/lib/liv/delivery-store',()=>({readDeliveryState:m.state}));
vi.mock('@/lib/liv/delivery-alert-context',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/lib/liv/delivery-alert-context')>();
 return {...actual,readDeliveryAlertContext:m.context};
});
import { GET } from '@/app/api/liv/delivery/alert-preview/route';
import { projectDeliveryAlertContext } from '@/lib/liv/delivery-alert-context';
import { emptyDeliveryState } from '@/lib/liv/delivery-policy';
const request=(query='?day=2026-10-04')=>new NextRequest(`https://ai.aproposmagazine.com/api/liv/delivery/alert-preview${query}`);
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T18:30:00Z'));
 m.access.mockResolvedValue({owner:true,uid:'owner'});m.state.mockResolvedValue(emptyDeliveryState());
 m.context.mockImplementation(async(state,day,now)=>projectDeliveryAlertContext({state,day,now}));
});
afterEach(()=>vi.useRealTimers());
it.each([null,{owner:false,uid:'colleague'}])('rejects non-owner access before any reads',async access=>{
 m.access.mockResolvedValue(access);const r=await GET(request());expect(r.status).toBe(403);expect(m.state).not.toHaveBeenCalled();
});
it.each(['2026-10-05','2026-10-03','invalid','../../secrets','2026-09-31'])('rejects future/off/invalid dates %s',async day=>{
 const r=await GET(request(`?day=${day}`));expect(r.status).toBe(400);expect(m.context).not.toHaveBeenCalled();
});
it('returns the same read-only email projection with private/no-store',async()=>{
 const r=await GET(request());const d=await r.json();
 expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');
 expect(d.preview).toBe(true);expect(d.context.version).toBe('2026-10-04-v1');
 expect(d.subject).toContain('Liv blev ikke udgivet');expect(d.text).toContain('KOPIÉR TIL EN NY CHATGPT-CHAT');
 expect(m.context).toHaveBeenCalledTimes(1);
});
it('calls a pending day delayed, not finally missed',async()=>{
 vi.setSystemTime(new Date('2026-10-04T08:30:00Z'));
 expect((await (await GET(request())).json()).subject).toContain('Liv er forsinket');
});
it('does not expose raw errors',async()=>{
 m.state.mockRejectedValue(new Error('Bearer secret'));const r=await GET(request());
 expect(r.status).toBe(503);expect(await r.text()).not.toContain('secret');
});
