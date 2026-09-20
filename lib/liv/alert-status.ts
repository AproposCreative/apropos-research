import { getAdminDb } from '@/lib/firebase-admin';
import { copenhagenClock, validDay } from './delivery-policy';

export function alertRecordStatus(raw: Record<string, any> | undefined, exists: boolean, now: Date) {
  const notice = raw?.resolved ?? raw?.finalFailure ?? raw?.failure;
  if (!exists) return 'not_recorded';
  if (!notice || typeof notice !== 'object') return 'unknown';
  if (notice.accepted === true) return raw?.resolved ? 'resolved_accepted' : 'failure_accepted';
  if (!Number.isFinite(notice.startedAt) || notice.startedAt < 0 || notice.startedAt > now.getTime()) return 'unknown';
  return now.getTime() - notice.startedAt >= 23 * 3600000 ? 'reconciliation_required' : 'unconfirmed';
}

/** Read-only projection. Never returns recipients, message bodies or provider IDs. */
export async function readDeliveryAlertStatus(now = new Date()) {
  const db = getAdminDb();
  if (!db) throw new Error('liv_alert_store_unavailable');
  const day = copenhagenClock(now).day;
  const snapshot = await db.collection('livDeliveryAlerts').doc(day).get();
  const status = alertRecordStatus(snapshot.data(), snapshot.exists, now);
  return { day, status };
}

/** Keyset pagination retains access to all historical records without an unbounded scan. */
export async function readDeliveryAlertHistory(cursor?: string, now = new Date()) {
  if (cursor !== undefined && !validDay(cursor)) throw new Error('invalid_alert_cursor');
  const db = getAdminDb();
  if (!db) throw new Error('liv_alert_store_unavailable');
  // An ordinary date field uses the automatic single-field index. Descending
  // document-ID order requires a separate manual index in this database.
  let query = db.collection('livDeliveryAlerts').orderBy('day', 'desc');
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.limit(21).get();
  const records = snapshot.docs.slice(0, 20).map(doc => {
    if (!validDay(doc.id) || doc.data()?.day !== doc.id) throw new Error('invalid_alert_record');
    return { day: doc.id, status: alertRecordStatus(doc.data(), true, now) };
  });
  return { records, nextCursor: snapshot.docs.length > 20 ? records[records.length - 1].day : null };
}
