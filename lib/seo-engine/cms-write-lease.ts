import { createHash, randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';

// Longer than the worker's maximum request duration. No indexes or deployment needed.
const LEASE_MS = 10 * 60_000;
const COLLECTION = 'seoEngineOpportunityIdempotency';

/** Serialize SEO worker/apply/rollback for one item and locale, not just one proposal. */
export async function acquireCmsWriteLease(itemId: string, locale: string) {
  const db = getAdminDb();
  if (!db) throw Object.assign(new Error('CMS-skrivning kræver Firestore'), { code: 'fail_closed' });
  const id = `cms:${createHash('sha256').update(`${itemId}:${locale}`).digest('hex')}`;
  const ref = db.collection(COLLECTION).doc(id);
  const owner = randomUUID();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data?.owner && Number(data.expiresAt) > Date.now()) {
      throw Object.assign(new Error('Artiklens SEO behandles allerede'), { code: 'write_busy' });
    }
    tx.set(ref, { owner, expiresAt: Date.now() + LEASE_MS });
  });
  return {
    /** Check ownership immediately before a CMS write; expired owners must stop. */
    async assertOwned() {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data();
        if (data?.owner !== owner || Number(data.expiresAt) <= Date.now()) {
          throw Object.assign(new Error('CMS-lås er udløbet'), { code: 'write_busy' });
        }
        tx.set(ref, { owner, expiresAt: Date.now() + LEASE_MS });
      });
    },
    async release() {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.data()?.owner === owner) tx.delete(ref);
      });
    },
  };
}
