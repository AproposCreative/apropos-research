import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DeliveryState, ReadyEntry } from '@/lib/liv/delivery-policy';
const fixture = vi.hoisted(() => ({ rows:new Map<string,any>(), writes:vi.fn(), queue:Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/firebase-admin',()=>({getAdminDb:()=>({
  collection:(name:string)=>({doc:(id:string)=>({path:`${name}/${id}`})}),
  runTransaction:(callback:any)=>{const task=fixture.queue.then(async()=>callback({
    get:async(ref:any)=>({data:()=>structuredClone(fixture.rows.get(ref.path))}),
    set:(ref:any,value:any)=>{fixture.writes(ref.path);fixture.rows.set(ref.path,value);},
  }));fixture.queue=task.catch(()=>{});return task;},
})}));
import { claimReserveCandidate, reserveNeeded } from '@/lib/liv/reserve-preparation';
import { deliveryAlertKind } from '@/lib/liv/delivery-alerts';
const day='2026-09-13', now=Date.parse('2026-09-13T07:00:00Z');
const entry:ReadyEntry={itemId:'a'.repeat(24),slug:'next',title:'Next',scheduledDay:'2026-09-14',expiresDay:'2026-09-14',kind:'scheduled',state:'ready',preparedAt:'2026-09-13',payloadHash:'hash'};
const state=():DeliveryState=>({entries:[{...entry}],slots:{[day]:{itemId:'published',state:'published',token:'done',leaseUntil:0,attempts:1,nextAttemptAt:0}},preparation:{token:'lease',leaseUntil:now+360000}});
beforeEach(()=>{fixture.rows.clear();fixture.writes.mockClear();fixture.queue=Promise.resolve();vi.stubEnv('LIV_RESERVE_ENABLED','true');fixture.rows.set('livDelivery/manifest',state());});
afterEach(()=>vi.unstubAllEnvs());
it('is opt-in and does not read or mutate when off',async()=>{
  vi.stubEnv('LIV_RESERVE_ENABLED','false');expect(await claimReserveCandidate('lease',now)).toBeNull();expect(fixture.writes).not.toHaveBeenCalled();
});
it('persists one job identity before work and keeps it across midnight and concurrent claims',async()=>{
  const results=await Promise.all(Array.from({length:5},()=>claimReserveCandidate('lease',now)));
  expect(results.every(r=>r?.dayKey===day)).toBe(true);expect(fixture.writes).toHaveBeenCalledTimes(1);
  const tomorrow=now+86400000, s=fixture.rows.get('livDelivery/manifest');
  s.slots['2026-09-14']={...s.slots[day]};s.entries[0]={...entry,scheduledDay:'2026-09-15',expiresDay:'2026-09-15'};
  s.preparation.leaseUntil=tomorrow+360000;
  fixture.rows.set(`livDailyArticles/reserve-${day}`,{status:'failed',articleCheckpoint:{content:'Paid work'}});
  expect(await claimReserveCandidate('lease',tomorrow)).toEqual({dayKey:day,kind:'reserve'});
  expect(fixture.rows.get(`livDailyArticles/reserve-${day}`).articleCheckpoint.content).toBe('Paid work');
  expect(fixture.writes).toHaveBeenCalledTimes(1);
});
it.each(['today','tomorrow','cover','attempted','blocked-tomorrow'])('does not compete with %s work',kind=>{
  const s=state();
  if(kind==='today')s.slots={};
  if(kind==='tomorrow')s.entries=[];
  if(kind==='cover')s.coverRevision={id:'x',itemId:'x',day};
  if(kind==='attempted')s.slots[day].state='attempted';
  if(kind==='blocked-tomorrow')s.entries[0].publicationBlockers=['media'];
  expect(reserveNeeded(s,day)).toBe(false);
});
it.each(['ready','selected','rejected'] as const)('preserves a %s reserve instead of buying its replacement',status=>{
  const s=state();s.entries.push({...entry,kind:'reserve',state:status,scheduledDay:day,publicationBlockers:status==='ready'?['media']:[]});
  expect(reserveNeeded(s,day)).toBe(false);
});
it('replenishes a consumed older reserve but never a second job on the same day',async()=>{
  const s=fixture.rows.get('livDelivery/manifest');s.reservePreparation={dayKey:'2026-09-12'};
  fixture.rows.set('livDailyArticles/reserve-2026-09-12',{status:'draft',webflowItemId:'published'});
  expect(await claimReserveCandidate('lease',now)).toEqual({dayKey:day,kind:'reserve'});
  fixture.rows.set(`livDailyArticles/reserve-${day}`,{status:'draft',webflowItemId:'published'});
  expect(await claimReserveCandidate('lease',now)).toBeNull();
});
it('does not abandon an unadmitted CMS item when its age changes',async()=>{
  fixture.rows.get('livDelivery/manifest').reservePreparation={dayKey:'2026-09-01'};
  fixture.rows.set('livDailyArticles/reserve-2026-09-01',{webflowItemId:'unresolved'});
  expect(await claimReserveCandidate('lease',now)).toEqual({dayKey:'2026-09-01',kind:'reserve'});
  expect(fixture.writes).not.toHaveBeenCalled();
});
it('rejects a wrong lease without changing the manifest',async()=>{
  await expect(claimReserveCandidate('wrong',now)).rejects.toThrow('lease_lost');expect(fixture.writes).not.toHaveBeenCalled();
});
it('can claim a content-failure fallback before tomorrow is ready, keeping one durable identity',async()=>{
  const s=fixture.rows.get('livDelivery/manifest');s.entries=[];
  expect(reserveNeeded(s,day)).toBe(false);
  expect(reserveNeeded(s,day,true)).toBe(true);
  expect(await claimReserveCandidate('lease',now,true)).toEqual({dayKey:day,kind:'reserve'});
  fixture.rows.set(`livDailyArticles/reserve-${day}`,{status:'failed',reason:'saved_failure'});
  expect(await claimReserveCandidate('lease',now,true)).toEqual({dayKey:day,kind:'reserve'});
  expect(fixture.writes).toHaveBeenCalledTimes(1);
});
it('fallback still respects a held reserve, a cover revision, an uncertain publish and the off switch',()=>{
  const s=state();s.entries=[];
  s.coverRevision={id:'x',itemId:'x',day};expect(reserveNeeded(s,day,true)).toBe(false);
  delete s.coverRevision;s.slots[day].state='attempted';expect(reserveNeeded(s,day,true)).toBe(false);
  s.slots[day].state='published';s.entries=[{...entry,kind:'reserve',state:'rejected'}];
  expect(reserveNeeded(s,day,true)).toBe(false);
  s.entries=[];vi.stubEnv('LIV_RESERVE_ENABLED','false');expect(reserveNeeded(s,day,true)).toBe(false);
});
it('does not call a reserve failure a failed daily publication before its deadline',()=>{
  const s=state();s.slots={};
  expect(deliveryAlertKind(s,{},new Date(now),day,{day,scope:'reserve',status:'blocked_saved_work',runStatus:'failed',reasonCode:'operator_retry_required'})).toBeNull();
});
