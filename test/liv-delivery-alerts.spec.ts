import { expect, it } from 'vitest';
import { deliveryAlertKind, type DeliveryAlertRecord } from '@/lib/liv/delivery-alerts';
import { emptyDeliveryState } from '@/lib/liv/delivery-policy';
import { livPreparationStatusForRow } from '@/lib/liv/preparation-status';
const sent = {accepted:true,startedAt:0,leaseUntil:0,payload:{from:'fixture',to:'fixture',subject:'fixture',text:'fixture'}};
it('uses the existing preparation retry policy before alarming',()=>{
 const state=emptyDeliveryState();const now=new Date('2026-09-13T07:00:00Z');const day='2026-09-13';
 const classify=(row:any)=>deliveryAlertKind(state,{},now,day,livPreparationStatusForRow(day,'prepare',row,now.getTime()));
 expect(classify({status:'failed',preparationAttempts:1})).toBeNull();
 expect(classify({status:'processing',continuationReady:true,articleCheckpoint:{}})).toBeNull();
 expect(classify({status:'failed',preparationAttempts:3})).toBeNull();
 expect(classify({status:'skipped_factcheck',articleCheckpoint:{}})).toBeNull();
});
it('sends one final failure at 20 Copenhagen and deduplicates it',()=>{
 const state=emptyDeliveryState();
 expect(deliveryAlertKind(state,{failure:sent},new Date('2026-09-13T17:59:59Z'))).toBeNull();
 expect(deliveryAlertKind(state,{failure:sent},new Date('2026-09-13T18:00:00Z'))).toBe('finalFailure');
 expect(deliveryAlertKind(state,{failure:sent,finalFailure:sent},new Date('2026-09-13T18:15:00Z'))).toBeNull();
 expect(deliveryAlertKind(state,{failure:sent},new Date('2026-12-13T19:00:00Z'))).toBe('finalFailure');
});
it('waits until 10:15 in both summer and winter Danish time',()=>{
 const s=emptyDeliveryState();
 expect(deliveryAlertKind(s,{},new Date('2026-09-13T08:14:59Z'))).toBeNull();
 expect(deliveryAlertKind(s,{},new Date('2026-09-13T08:15:00Z'))).toBe('failure');
 expect(deliveryAlertKind(s,{},new Date('2026-12-13T09:14:59Z'))).toBeNull();
 expect(deliveryAlertKind(s,{},new Date('2026-12-13T09:15:00Z'))).toBe('failure');
});
it('sends one failure and one resolution, never success without prior failure',()=>{
 const s=emptyDeliveryState();const now=new Date('2026-09-13T09:00:00Z');
 const old:DeliveryAlertRecord={failure:sent};
 expect(deliveryAlertKind(s,old,now)).toBeNull();
 s.slots['2026-09-13']={itemId:'fixture',token:'fixture',state:'published',leaseUntil:0,attempts:1,nextAttemptAt:0};
 expect(deliveryAlertKind(s,{},now)).toBeNull();
 expect(deliveryAlertKind(s,{failure:{...sent,accepted:false}},now)).toBe('failure');
 expect(deliveryAlertKind(s,old,now)).toBe('resolved');
 expect(deliveryAlertKind(s,{...old,resolved:sent},now)).toBeNull();
});
it('resolves a previous day after midnight without inventing a historical failure',()=>{
 const state=emptyDeliveryState();const now=new Date('2026-09-14T00:30:00Z');
 state.slots['2026-09-13']={state:'published',itemId:'fixture',token:'fixture',leaseUntil:0,attempts:1,nextAttemptAt:0};
 expect(deliveryAlertKind(state,{failure:sent},now,'2026-09-13')).toBe('resolved');
 expect(deliveryAlertKind(state,{},now,'2026-09-13')).toBeNull();
 expect(deliveryAlertKind(state,{},now,'2026-09-15')).toBeNull();
 expect(deliveryAlertKind(state,{},now,'bad')).toBeNull();
});
