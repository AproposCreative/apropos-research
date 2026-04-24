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
  articleIds?: string[];
}): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection(COLLECTION).add({
    uid: input.uid,
    kind: input.kind,
    status: input.status,
    subject: input.subject.slice(0, 500),
    detail: input.detail.slice(0, 500),
    ...(Array.isArray(input.articleIds) && input.articleIds.length > 0
      ? { articleIds: input.articleIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 20) }
      : {}),
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

export async function getRecentManualBroadcastArticleIds(maxSends: number): Promise<Set<string>> {
  const db = getAdminDb();
  const out = new Set<string>();
  if (!db || maxSends <= 0) return out;
  try {
    const snap = await db
      .collection(COLLECTION)
      .where('kind', '==', 'broadcast')
      .where('status', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(Math.min(maxSends, 52))
      .get();
    for (const doc of snap.docs) {
      const ids = doc.data()?.articleIds;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === 'string' && id.trim()) out.add(id.trim());
      }
    }
  } catch (e) {
    console.warn('[newsletter/manual-send-log] getRecentManualBroadcastArticleIds:', e);
  }
  return out;
}

export async function getLastManualBroadcastLead(): Promise<{ leadId: string | null; finishedAt: string | null }> {
  const db = getAdminDb();
  if (!db) return { leadId: null, finishedAt: null };
  try {
    const snap = await db
      .collection(COLLECTION)
      .where('kind', '==', 'broadcast')
      .where('status', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();
    const doc = snap.docs[0];
    if (!doc) return { leadId: null, finishedAt: null };
    const d = doc.data();
    const ids = d?.articleIds;
    const ts = d?.sentAt as Timestamp | undefined;
    const first = Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0].trim() : '';
    return {
      leadId: first || null,
      finishedAt: ts ? ts.toDate().toISOString() : null,
    };
  } catch (e) {
    console.warn('[newsletter/manual-send-log] getLastManualBroadcastLead:', e);
    return { leadId: null, finishedAt: null };
  }
}
