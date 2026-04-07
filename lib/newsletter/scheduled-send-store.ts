import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

export const SCHEDULED_SEND_COLLECTION = 'newsletterScheduledSends';

const MAX_HTML_CHARS = 900_000;

export type ScheduledSendListItem = {
  id: string;
  scheduledFor: string;
  subject: string;
  createdAt: string | null;
};

export type ScheduledSendHistoryItem = {
  id: string;
  scheduledFor: string;
  subject: string;
  status: 'sent' | 'failed';
  finishedAt: string;
  error?: string;
  summary?: string;
};

export async function createScheduledSend(input: {
  uid: string;
  scheduledFor: Date;
  subject: string;
  html: string;
}): Promise<string> {
  if (input.html.length > MAX_HTML_CHARS) {
    throw new Error('HTML-indhold er for stort til planlægning');
  }
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke konfigureret — planlagt send kræver Firebase Admin');
  const ref = await db.collection(SCHEDULED_SEND_COLLECTION).add({
    uid: input.uid,
    scheduledFor: Timestamp.fromDate(input.scheduledFor),
    subject: input.subject.trim(),
    html: input.html,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function listPendingScheduledForUser(uid: string): Promise<ScheduledSendListItem[]> {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db.collection(SCHEDULED_SEND_COLLECTION).where('uid', '==', uid).where('status', '==', 'pending').limit(25).get();
  const items: ScheduledSendListItem[] = snap.docs.map((doc) => {
    const d = doc.data();
    const scheduledFor = d.scheduledFor as Timestamp | undefined;
    const createdAt = d.createdAt as Timestamp | undefined;
    return {
      id: doc.id,
      scheduledFor: scheduledFor ? scheduledFor.toDate().toISOString() : '',
      subject: typeof d.subject === 'string' ? d.subject : '',
      createdAt: createdAt ? createdAt.toDate().toISOString() : null,
    };
  });
  items.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  return items;
}

/**
 * Seneste afsluttede jobs (sendt / fejlet) til visning i UI.
 * Kræver sammensatte Firestore-indekser: (uid, status, sentAt desc) og (uid, status, failedAt desc).
 */
export async function listFinishedScheduledForUser(
  uid: string,
  limitEach = 10
): Promise<ScheduledSendHistoryItem[]> {
  const db = getAdminDb();
  if (!db) return [];

  const [sentSnap, failedSnap] = await Promise.all([
    db
      .collection(SCHEDULED_SEND_COLLECTION)
      .where('uid', '==', uid)
      .where('status', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(limitEach)
      .get(),
    db
      .collection(SCHEDULED_SEND_COLLECTION)
      .where('uid', '==', uid)
      .where('status', '==', 'failed')
      .orderBy('failedAt', 'desc')
      .limit(limitEach)
      .get(),
  ]);

  const sent: ScheduledSendHistoryItem[] = sentSnap.docs.map((doc) => {
    const d = doc.data();
    const scheduledFor = (d.scheduledFor as Timestamp | undefined)?.toDate().toISOString() ?? '';
    const finishedAt = (d.sentAt as Timestamp | undefined)?.toDate().toISOString() ?? '';
    return {
      id: doc.id,
      scheduledFor,
      subject: typeof d.subject === 'string' ? d.subject : '',
      status: 'sent' as const,
      finishedAt,
      summary: typeof d.sentSummary === 'string' ? d.sentSummary : undefined,
    };
  });

  const failed: ScheduledSendHistoryItem[] = failedSnap.docs.map((doc) => {
    const d = doc.data();
    const scheduledFor = (d.scheduledFor as Timestamp | undefined)?.toDate().toISOString() ?? '';
    const finishedAt = (d.failedAt as Timestamp | undefined)?.toDate().toISOString() ?? '';
    return {
      id: doc.id,
      scheduledFor,
      subject: typeof d.subject === 'string' ? d.subject : '',
      status: 'failed' as const,
      finishedAt,
      error: typeof d.error === 'string' ? d.error : undefined,
    };
  });

  return [...sent, ...failed]
    .filter((x) => x.finishedAt)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, limitEach);
}

const STALE_PROCESSING_MS = 20 * 60 * 1000;

/** Genskaber pending hvis en function crashede efter claim (undgår evigt hængende "processing"). */
export async function reclaimStaleProcessingScheduledSends(): Promise<number> {
  const db = getAdminDb();
  if (!db) return 0;
  const snap = await db.collection(SCHEDULED_SEND_COLLECTION).where('status', '==', 'processing').limit(30).get();
  const cutoff = Date.now() - STALE_PROCESSING_MS;
  let n = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const started = (d.processingStartedAt as Timestamp | undefined)?.toMillis() ?? 0;
    if (started > 0 && started < cutoff) {
      await doc.ref.update({
        status: 'pending',
        processingStartedAt: FieldValue.delete(),
      });
      n += 1;
    }
  }
  return n;
}

export async function cancelScheduledSend(id: string, uid: string): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;
  const ref = db.collection(SCHEDULED_SEND_COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return false;
  const d = doc.data()!;
  if (d.uid !== uid || d.status !== 'pending') return false;
  await ref.update({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() });
  return true;
}

export type ClaimedScheduledJob = { id: string; subject: string; html: string };

/**
 * Finder et forfaldent `pending`-job og sætter det til `processing` atomisk.
 *
 * Bruger `scheduledFor <= nu` i Firestore (plus orderBy), så forfaldne jobs ikke
 * forsvinder bag et vilkårligt `limit(40)` af alle pending — det var årsag til at
 * planlagte sends aldrig blev plukket, selvom cron kørte.
 *
 * Kræver sammensat indeks: (status, scheduledFor). Ved `restrictToUid`: (status, uid, scheduledFor) — samme rækkefølge som i firestore.indexes.json / Firebase-konsollen.
 */
export async function claimNextDueScheduledSend(options?: {
  restrictToUid?: string;
}): Promise<ClaimedScheduledJob | null> {
  const db = getAdminDb();
  if (!db) return null;
  const now = Timestamp.fromMillis(Date.now());
  const col = db.collection(SCHEDULED_SEND_COLLECTION);
  const q = options?.restrictToUid
    ? col
        .where('status', '==', 'pending')
        .where('uid', '==', options.restrictToUid)
        .where('scheduledFor', '<=', now)
        .orderBy('scheduledFor', 'asc')
        .limit(10)
    : col
        .where('status', '==', 'pending')
        .where('scheduledFor', '<=', now)
        .orderBy('scheduledFor', 'asc')
        .limit(25);

  const snap = await q.get();

  for (const doc of snap.docs) {
    let claimed: ClaimedScheduledJob | null = null;
    try {
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(doc.ref);
        const d = cur.data();
        if (!d || d.status !== 'pending') return;
        const sch = d.scheduledFor as Timestamp;
        if (sch.toMillis() > Date.now()) return;
        if (options?.restrictToUid && d.uid !== options.restrictToUid) return;
        const subject = typeof d.subject === 'string' ? d.subject : '';
        const html = typeof d.html === 'string' ? d.html : '';
        if (!subject || !html) return;
        tx.update(doc.ref, { status: 'processing', processingStartedAt: FieldValue.serverTimestamp() });
        claimed = { id: doc.id, subject, html };
      });
    } catch {
      continue;
    }
    if (claimed) return claimed;
  }
  return null;
}

export async function markScheduledSendFinished(
  id: string,
  result: { ok: true; summary: string } | { ok: false; error: string }
): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection(SCHEDULED_SEND_COLLECTION).doc(id);
  if (result.ok === false) {
    await ref.update({
      status: 'failed',
      failedAt: FieldValue.serverTimestamp(),
      error: result.error.slice(0, 2000),
    });
    return;
  }
  await ref.update({
    status: 'sent',
    sentAt: FieldValue.serverTimestamp(),
    sentSummary: result.summary,
  });
}
