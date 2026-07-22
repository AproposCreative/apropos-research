import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { COL } from '@/lib/seo-engine/store';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ANALYZE = 10;

/**
 * Durable per-uid sliding window via Firestore transaction.
 * Forbidden: in-memory Maps in serverless.
 */
export async function assertAnalyzeRateLimit(uid: string): Promise<void> {
  const db = getAdminDb();
  if (!db) {
    // Fail closed in prod-like paths when DB missing — callers should already 503 on store.
    throw new Error('rate_limit_unavailable');
  }

  const ref = db.collection(COL.rateLimits).doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? (snap.data() as { timestamps?: number[] }) : {};
    const prev = Array.isArray(data.timestamps) ? data.timestamps : [];
    const recent = prev.filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_ANALYZE) {
      const err = new Error('rate_limited');
      (err as Error & { code?: string }).code = 'rate_limited';
      throw err;
    }
    recent.push(now);
    tx.set(
      ref,
      {
        timestamps: recent,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}
