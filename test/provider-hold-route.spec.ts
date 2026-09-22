import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),resume:vi.fn()}));
vi.mock('@/lib/editorial-access',()=>({editorialRequestAccess:m.access}));
vi.mock('@/lib/ai/provider-hold',()=>({readProviderHold:m.read,resumeProvider:m.resume}));
import {GET,POST} from '@/app/api/ai-cost/provider/route';
const req=(body:unknown)=>new NextRequest('https://app.example/api/ai-cost/provider',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>vi.resetAllMocks());
it.each([null,{owner:false}])('denies nonowner before reading/writing',async access=>{
 m.access.mockResolvedValue(access);
 expect((await GET(new NextRequest('https://app.example/api/ai-cost/provider'))).status).toBe(403);
 expect((await POST(req({action:'resume-after-billing-change',revision:1}))).status).toBe(403);
 expect(m.read).not.toHaveBeenCalled();expect(m.resume).not.toHaveBeenCalled();
});
it('requires explicit action and exact revision; preserves private headers',async()=>{
 m.access.mockResolvedValue({owner:true,uid:'owner'});m.resume.mockResolvedValue({blocked:false,revision:2});
 expect((await POST(req({revision:1}))).status).toBe(400);
 const result=await POST(req({action:'resume-after-billing-change',revision:1}));
 expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toBe('private, no-store');
 expect(m.resume).toHaveBeenCalledWith(1,'owner');
 m.resume.mockRejectedValue(Error('provider_hold_conflict'));
 expect((await POST(req({action:'resume-after-billing-change',revision:1}))).status).toBe(409);
});
