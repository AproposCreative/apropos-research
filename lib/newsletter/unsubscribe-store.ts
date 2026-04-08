import { getAdminDb } from '@/lib/firebase-admin';

const COLLECTION = 'newsletter_unsubscribes';

/** Tilføj e-mail til frameldings-listen (idempotent). */
export async function addUnsubscribe(email: string): Promise<{
  ok: boolean;
  error?: string;
  /** true første gang denne e-mail frameldes (til én bekræftelsesmail). */
  firstUnsubscribe?: boolean;
}> {
  const db = getAdminDb();
  if (!db) return { ok: false, error: 'Firebase Admin ikke konfigureret' };
  const normalized = email.trim().toLowerCase();
  try {
    const ref = db.collection(COLLECTION).doc(normalized);
    const before = await ref.get();
    const alreadyListed = before.exists;
    await ref.set(
      {
        email: normalized,
        unsubscribedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return { ok: true, firstUnsubscribe: !alreadyListed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Firestore-fejl' };
  }
}

/** Hent alle frameldte e-mails (set). */
export async function getUnsubscribedEmails(): Promise<Set<string>> {
  const db = getAdminDb();
  if (!db) return new Set();
  try {
    const snap = await db.collection(COLLECTION).get();
    const s = new Set<string>();
    for (const doc of snap.docs) {
      const e = doc.data()?.email;
      if (typeof e === 'string') s.add(e.toLowerCase());
    }
    return s;
  } catch {
    return new Set();
  }
}

/**
 * Slet frameldings-markering for de angivne adresser (batch).
 * Bruges når e-mail igen findes som aktiv tilmelding i Webflow — gen-tilmelding.
 */
export async function removeUnsubscribeRecordsForEmails(emails: string[]): Promise<void> {
  const db = getAdminDb();
  if (!db || emails.length === 0) return;
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const BATCH = 400;
  try {
    for (let i = 0; i < unique.length; i += BATCH) {
      const chunk = unique.slice(i, i + BATCH);
      const batch = db.batch();
      for (const email of chunk) {
        batch.delete(db.collection(COLLECTION).doc(email));
      }
      await batch.commit();
    }
  } catch (e) {
    console.warn('[newsletter] removeUnsubscribeRecordsForEmails:', e);
  }
}

/** Er en given e-mail frameldt? */
export async function isUnsubscribed(email: string): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;
  try {
    const doc = await db.collection(COLLECTION).doc(email.trim().toLowerCase()).get();
    return doc.exists;
  } catch {
    return false;
  }
}
