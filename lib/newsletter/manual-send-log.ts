import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

const COLLECTION = 'newsletterManualSendLog';

export type ManualSendLogEntry = {
  id: string;
  kind: 'test' | 'broadcast';
  status: 'sent' | 'failed';
  subject: string;
  finishedAt: string;
  detail: string;
  error?: string;
};

export async function recordManualNewsletterLog(input: {
  uid: string;
  kind: 'test' | 'broadcast';
  status: 'sent' | 'failed';
  subject: string;
  detail: string;
  error?: string;
}): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection(COLLECTION).add({
    uid: input.uid,
    kind: input.kind,
    status: input.status,
    subject: input.subject.slice(0, 500),
    detail: input.detail.slice(0, 500),
    ...(input.error ? { error: input.error.slice(0, 1500) } : {}),
    sentAt: FieldValue.serverTimestamp(),
  });
}

function docToEntry(doc: QueryDocumentSnapshot): ManualSendLogEntry {
  const d = doc.data();
  const ts = d.sentAt as Timestamp | undefined;
  const st = d.status === 'failed' ? 'failed' : 'sent';
  return {
    id: doc.id,
    kind: d.kind === 'broadcast' ? 'broadcast' : 'test',
    status: st,
    subject: typeof d.subject === 'string' ? d.subject : '',
    finishedAt: ts ? ts.toDate().toISOString() : new Date(0).toISOString(),
    detail: typeof d.detail === 'string' ? d.detail : '',
    error: typeof d.error === 'string' ? d.error : undefined,
  };
}

export async function listRecentManualSends(uid: string, limit = 20): Promise<ManualSendLogEntry[]> {
  const db = getAdminDb();
  if (!db) return [];
  const cap = Math.min(limit, 40);
  try {
    const snap = await db
      .collection(COLLECTION)
      .where('uid', '==', uid)
      .orderBy('sentAt', 'desc')
      .limit(cap)
      .get();
    return snap.docs.map(docToEntry);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const indexMissing = /FAILED_PRECONDITION|requires an index|composite/i.test(msg);
    if (!indexMissing) console.warn('[newsletter/manual-send-log] listRecentManualSends:', e);
    try {
      const snap = await db.collection(COLLECTION).where('uid', '==', uid).limit(80).get();
      const rows = snap.docs.map(docToEntry);
      rows.sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : a.finishedAt > b.finishedAt ? -1 : 0));
      return rows.slice(0, cap);
    } catch (e2) {
      console.warn('[newsletter/manual-send-log] listRecentManualSends fallback:', e2);
      return [];
    }
  }
}
