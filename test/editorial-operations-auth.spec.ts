import {expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('@/lib/config/env',()=>({env:{CRON_SECRET:'test-only-secret'}}));
const calls=vi.hoisted(()=>({draft:vi.fn(),live:vi.fn()}));
vi.mock('@/lib/liv/presentation-revision',()=>({reviseLivPresentation:calls.draft}));
vi.mock('@/lib/seo-engine/post-publish/editorial-revision',()=>({reviseReviewedMetadata:calls.live,editorialRevisionInput:{parse:(x:unknown)=>x}}));
import {POST as draft} from '@/app/api/liv/operations/presentation/route';
import {POST as live} from '@/app/api/seo-engine/operations/reviewed/route';
it.each([draft,live])('requires cron authentication before reading or changing CMS',async handler=>{
 const prior=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only-secret-not-a-production-credential-1234567890';
 try{const r=await handler(new NextRequest('https://example.org/api',{method:'POST',body:'{}'}));expect(r.status).toBe(403);expect(calls.draft).not.toHaveBeenCalled();expect(calls.live).not.toHaveBeenCalled();}
 finally{if(prior===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prior;}
});
