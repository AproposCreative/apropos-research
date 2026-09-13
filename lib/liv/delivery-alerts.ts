import { Resend } from 'resend';
import { getAdminDb } from '@/lib/firebase-admin';
import { publicationTime, copenhagenClock, validDay, type DeliveryState } from './delivery-policy';

type Notice = { startedAt: number; leaseUntil: number; accepted?: boolean; providerId?: string;
  payload: {from:string;to:string;subject:string;text:string} };
export type DeliveryAlertRecord = { failure?: Notice; resolved?: Notice };

/** No alarm before the 10:15 Danish deadline unless a definitive rejection exists. */
export function deliveryAlertKind(state: DeliveryState, old: DeliveryAlertRecord, now = new Date(), day = copenhagenClock(now).day) {
  if (!validDay(day) || day > copenhagenClock(now).day) return null;
  // Historical slots may resolve existing notices, never create retrospective alarms.
  if (day < copenhagenClock(now).day && !old.failure) return null;
  // Reconcile the same uncertain failure send before announcing its resolution.
  if (old.failure && !old.failure.accepted) return 'failure';
  if (state.slots[day]?.state === 'published') {
    return old.failure?.accepted && !old.resolved?.accepted ? 'resolved' : null;
  }
  const terminal = state.entries.some(e => e.scheduledDay === day && e.state === 'rejected' && e.decision !== 'rejected');
  if (!old.failure?.accepted && (terminal || now.getTime() >= Date.parse(publicationTime(day)) + 15 * 60000)) return 'failure';
  return null;
}

/** Called by the existing authenticated check. Never publishes or generates content. */
async function notifyDeliveryDay(state: DeliveryState, now: Date, day: string) {
  const db = getAdminDb(); if (!db) throw new Error('liv_alert_store_unavailable');
  const ref = db.collection('livDeliveryAlerts').doc(day);
  const key = process.env.RESEND_API_KEY; const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) throw new Error('liv_alert_mail_configuration_missing');
  const claim = await db.runTransaction(async tx => {
    const old = ((await tx.get(ref)).data() || {}) as DeliveryAlertRecord;
    const kind = deliveryAlertKind(state, old, now, day); if (!kind) return null;
    let notice = old[kind];
    if (notice?.leaseUntil && notice.leaseUntil > now.getTime()) return null;
    // Do not resend an ambiguous operation outside the provider's idempotency window.
    if (notice && now.getTime() - notice.startedAt >= 23 * 3600000) throw new Error('liv_alert_reconciliation_required');
    notice ??= { startedAt:now.getTime(), leaseUntil:0, payload:{from,to:'frederik@aproposmagazine.com',
      subject:kind === 'failure' ? `Liv kræver opmærksomhed · ${day}` : `Liv er udgivet · ${day}`,
      text:kind === 'failure' ? `Dagens Liv-udgivelse (${day}) er ikke bekræftet udgivet. Der er registreret en afvisning eller en overskredet frist. Gemt arbejde er bevaret.\n\nSe status på https://ai.aproposmagazine.com/ai?view=liv` : `Dagens Liv-udgivelse (${day}) er nu bekræftet i udgivelsesflowet.\n\nSe artiklen og status på https://ai.aproposmagazine.com/ai?view=liv`,
    }};
    notice.leaseUntil = now.getTime() + 2 * 60000;
    tx.set(ref,{...old,[kind]:notice});
    return {kind,notice};
  });
  if (!claim) return {status:'unchanged'};
  // Retain the lease and immutable payload on any uncertain send/readback failure.
  const result = await new Resend(key).emails.send(claim.notice.payload,{idempotencyKey:`liv-alert-${day}-${claim.kind}`});
  if (result.error || !result.data?.id) throw new Error('liv_alert_send_unconfirmed');
  await ref.update({[`${claim.kind}.accepted`]:true,[`${claim.kind}.providerId`]:result.data.id,[`${claim.kind}.leaseUntil`]:0});
  return {status:'accepted',kind:claim.kind};
}

export async function notifyDeliveryHealth(state: DeliveryState, now = new Date()) {
  const today = copenhagenClock(now).day;
  const days = [today, ...Object.keys(state.slots).filter(day => validDay(day) && day < today).sort().reverse().slice(0,14)];
  const results = []; const failedDays: string[] = [];
  for (const day of days) {
    try { results.push({day,...await notifyDeliveryDay(state,now,day)}); }
    catch { failedDays.push(day); }
  }
  if (failedDays.length) throw new Error(`liv_alert_unconfirmed:${failedDays.join(',')}`);
  return results;
}
