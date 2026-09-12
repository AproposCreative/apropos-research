import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { copenhagenClock, validDay } from './delivery-policy';
import { LIV_DAILY_COLLECTION, livDailyDocId } from './daily-history-store';
import { cmsFieldHash } from './cms-field-hash';
import { livImageArticleHash } from './article-image-hash';
import type { LivDailyPlan } from './daily-plan-store';

const text = (max: number) => z.string().trim().min(3).max(max)
  .refine(value => !/[<>\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value));
export const explicitPreparationInput = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  dayKey: z.string().refine(validDay),
  topicHint: text(200), directiveHint: text(4000),
  articleFormat: z.enum(['article', 'research-review']),
}).strict();

/** Called only behind cron auth and the shared preparation lease. This reserves
 * input/ownership, never a retry grant, quality approval or separate workflow. */
export async function reserveExplicitLivPreparation(value: unknown, lease: string, now = Date.now()) {
  const parsed = explicitPreparationInput.safeParse(value);
  if (!parsed.success || parsed.data.dayKey !== copenhagenClock(new Date(now)).day) throw new Error('liv_prepare_invalid');
  const input = parsed.data;
  const db = getAdminDb();
  if (!db) throw new Error('liv_prepare_store_unavailable');
  const id = livDailyDocId(input.dayKey, 'reserve-editorial');
  const inputHash = cmsFieldHash(input);
  const reservation = db.collection('livExplicitPreparations').doc(id);
  const run = db.collection(LIV_DAILY_COLLECTION).doc(id);
  const manifest = db.collection('livDelivery').doc('manifest');
  await db.runTransaction(async tx => {
    const state = (await tx.get(manifest)).data();
    const saved = (await tx.get(reservation)).data();
    const row = (await tx.get(run)).data();
    if (!state?.preparation || state.preparation.token !== lease ||
      !Number.isFinite(state.preparation.leaseUntil) || state.preparation.leaseUntil <= now) throw new Error('liv_prepare_lease_lost');
    if (state.coverRevision || Object.values(state.slots || {}).some(slot =>
      (slot as { state?: unknown })?.state === 'attempted')) throw new Error('liv_prepare_delivery_hold');
    if (!saved) {
      if (row) throw new Error('liv_prepare_conflict');
      tx.create(reservation, { input, inputHash, createdAt: FieldValue.serverTimestamp() });
      // Bind this exact explicit reserve namespace before the shared runner claims
      // it. No status/counter reset, and an unrelated existing row cannot be adopted.
      tx.create(run, { dayKey: input.dayKey, explicitPreparationInputHash: inputHash });
      return;
    }
    if (saved.inputHash !== inputHash || !saved.input || cmsFieldHash(saved.input) !== inputHash ||
      row?.dayKey !== input.dayKey || row?.explicitPreparationInputHash !== inputHash) throw new Error('liv_prepare_conflict');
    // The shared runner claims the row before any provider work. Exactly this
    // identity-only seed proves it never claimed; status/attempts/other fields,
    // even a falsey status, must not be mistaken for a free retry.
    if (Object.keys(row).length === 2 && Object.keys(row).every(key =>
      key === 'dayKey' || key === 'explicitPreparationInputHash')) return;
    const article = row.articleCheckpoint;
    if (row.status !== 'processing' || row.continuationReady !== true || row.retryAuthorization ||
      row.webflowItemId || row.preparationProof || row.cmsSaveStarted || !article ||
      !['title', 'slug', 'intro', 'content'].every(key => typeof article[key] === 'string') ||
      !article.title.trim() || !article.content.trim() || row.articleCheckpointHash !== livImageArticleHash(article)) {
      throw new Error('liv_prepare_blocked_saved_work');
    }
    // The runner alone consumes the continuation and revalidates every gate.
  });
  const defaultPlan: LivDailyPlan = { dayKey: input.dayKey, topicHint: input.topicHint,
    directiveHint: input.directiveHint, articleFormat: input.articleFormat, mustUseTrending: false,
    status: 'pending', createdAt: null, updatedAt: null };
  return { dayKey: input.dayKey, kind: 'reserve' as const, scope: 'reserve-editorial' as const, defaultPlan };
}
