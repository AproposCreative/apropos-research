import { getAdminDb } from '@/lib/firebase-admin';
import type { ModelStageRecord, ModelStageStore } from './durable-model';

export function firestoreModelStageStore(): ModelStageStore {
  const db = getAdminDb();
  if (!db) throw new Error('seo_firestore_unavailable');
  return {
    async transact(key, fn) {
      const ref = db.collection('seoPostPublishModelStages').doc(key);
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const mutation = fn(snap.exists ? snap.data() as ModelStageRecord : null);
        if (mutation.next) tx.set(ref, mutation.next);
        return mutation.result;
      });
    },
  };
}
