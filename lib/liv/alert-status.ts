import { getAdminDb } from '@/lib/firebase-admin';
import { copenhagenClock } from './delivery-policy';

/** Read-only projection. Never returns recipients, message bodies or provider IDs. */
export async function readDeliveryAlertStatus(now = new Date()) {
  const db = getAdminDb();
  if (!db) throw new Error('liv_alert_store_unavailable');
  const day = copenhagenClock(now).day;
  const snapshot = await db.collection('livDeliveryAlerts').doc(day).get();
  const raw = snapshot.data();
  const notice = raw?.resolved ?? raw?.failure;
  const status = !snapshot.exists ? 'not_recorded' : !notice ? 'unknown' :
    notice.accepted === true ? (raw?.resolved ? 'resolved_accepted' : 'failure_accepted') :
    typeof notice.startedAt !== 'number' ? 'unknown' :
    now.getTime() - notice.startedAt >= 23 * 3600000 ? 'reconciliation_required' : 'unconfirmed';
  return { day, status };
}
