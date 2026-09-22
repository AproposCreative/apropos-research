import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({rows:new Map<string,any>(),writes:vi.fn()}));
vi.mock('@/lib/firebase-admin',()=>{
  const ref=(path:string):any=>({path,id:path.split('/').at(-1),collection:(name:string)=>({doc:(id:string)=>ref(`${path}/${name}/${id}`)})});
  return {getAdminDb:()=>({collection:(name:string)=>({doc:(id:string)=>ref(`${name}/${id}`)}),
    runTransaction:async(fn:any)=>{
      const writes:Array<[string,any]>=[];
      const value=await fn({get:async(r:any)=>{if(writes.length)throw Error('read_after_write'); return {exists:state.rows.has(r.path),data:()=>state.rows.get(r.path)};},
        create:(r:any,v:any)=>{if(state.rows.has(r.path))throw Error('exists');writes.push([r.path,v]);},
        set:(r:any,v:any,o:any)=>writes.push([r.path,o?.merge?{...state.rows.get(r.path),...v}:v])});
      for(const [path,row]of writes){state.rows.set(path,row);state.writes(path);} return value;
    }})};
});
import {authorizePreparationRetry} from '@/lib/liv/retry-preparation';
import {cmsFieldHash} from '@/lib/liv/cms-field-hash';
const run='livDailyArticles/prepare-2026-09-24',plan='livDailyPlan/plan-2026-09-24';
const input=()=>({dayKey:'2026-09-24',kind:'scheduled' as const,requestId:'deferred-test-1',reason:'Replace obsolete unstarted brief',defer:true as const,
  expectedRunHash:cmsFieldHash(state.rows.get(run)),expectedPlanHash:cmsFieldHash(state.rows.get(plan)),
  plan:{topicHint:'New subject',directiveHint:'Verify before writing',articleFormat:'research-review' as const}});
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T06:00:00Z'));state.rows.clear();state.writes.mockClear();
 state.rows.set('livDelivery/manifest',{entries:[],slots:{},preparation:{token:'lease',leaseUntil:Date.now()+60000}});
 state.rows.set(run,{dayKey:'2026-09-24',status:'skipped_no_topic',preparationAttempts:7,reason:'old'});
 state.rows.set(plan,{topicHint:'Old subject',status:'pending'});
});
afterEach(()=>vi.useRealTimers());
it('archives exact prior rows and schedules without resetting status/counters or buying work',async()=>{
 const body=input(),before=structuredClone(state.rows.get(run));
 expect(await authorizePreparationRetry(body,'lease')).toEqual({status:'retry_authorized'});
 expect(state.rows.get(run)).toMatchObject(before);
 expect(state.rows.get(plan)).toMatchObject({topicHint:'New subject',status:'pending'});
 const audit=[...state.rows.entries()].find(([key])=>key.includes('/retryRequests/'))![1];
 expect(audit).toMatchObject({previous:before,previousPlan:{topicHint:'Old subject'},deferred:true});
 state.writes.mockClear();expect(await authorizePreparationRetry(body,'lease')).toEqual({status:'already_requested'});
 expect(state.writes).not.toHaveBeenCalled();
 await expect(authorizePreparationRetry({...body,plan:{...body.plan,topicHint:'Changed'}},'lease')).rejects.toThrow('conflict');
});
it.each(['plan-change','run-change','paid','cms','active','lease','other-scope','delivery-slot'])('rejects %s without writes',async kind=>{
 const body=input();
 if(kind==='plan-change')state.rows.get(plan).topicHint='Concurrent edit';
 if(kind==='run-change')state.rows.get(run).preparationAttempts++;
 if(kind==='paid')state.rows.get(run).articleCheckpoint={content:'Paid'};
 if(kind==='cms')state.rows.get(run).webflowItemId='cms-id';
 if(kind==='active')state.rows.get(run).status='processing';
 if(kind==='lease')state.rows.get('livDelivery/manifest').preparation.token='other';
 if(kind==='other-scope')state.rows.set('livDailyArticles/prepare-alternative-2026-09-24',{status:'failed'});
 if(kind==='delivery-slot')state.rows.get('livDelivery/manifest').slots['2026-09-24']={state:'published'};
 await expect(authorizePreparationRetry(body,'lease')).rejects.toThrow('conflict');expect(state.writes).not.toHaveBeenCalled();
});
it.each(['2026-09-22','2026-09-30'])('rejects date %s outside future preparation window',async dayKey=>{
 await expect(authorizePreparationRetry({...input(),dayKey},'lease')).rejects.toThrow('invalid'); expect(state.writes).not.toHaveBeenCalled();
});
