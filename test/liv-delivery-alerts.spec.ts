import { expect, it } from 'vitest';
import { deliveryAlertKind, type DeliveryAlertRecord } from '@/lib/liv/delivery-alerts';
import { emptyDeliveryState } from '@/lib/liv/delivery-policy';
const sent = {accepted:true,startedAt:0,leaseUntil:0,payload:{from:'fixture',to:'fixture',subject:'fixture',text:'fixture'}};
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
