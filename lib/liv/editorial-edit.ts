import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { applyLivFactPatches } from './fact-revision';
import { copenhagenClock, validDay } from './delivery-policy';
import { LIV_DAILY_COLLECTION, livDailyDocId } from './daily-history-store';
import { cmsFieldHash } from './cms-field-hash';
import { livImageArticleHash } from './article-image-hash';
import type { GeneratedArticle } from './generate-article';

export const editorialEditInput = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  dayKey: z.string().refine(validDay), scope: z.literal('reserve-editorial'),
  expectedArticleHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(3).max(500).refine(value => !/[<>\x00-\x1f]/.test(value)),
  patches: z.array(z.object({
    field: z.enum(['title', 'subtitle', 'intro', 'content', 'excerpt', 'seoTitle', 'seoDescription']),
    before: z.string().min(1).max(1000), after: z.string().max(1000),
  }).strict()).min(1).max(20),
}).strict();

/** Operator copyedit only. No provider calls, retry grants or quality approvals.
 * Normal preparation must resume afterward and validate the edited checkpoint. */
export async function editLivEditorialCheckpoint(value: unknown, lease: string, now = Date.now()) {
  const parsed = editorialEditInput.safeParse(value);
  if (!parsed.success || parsed.data.dayKey !== copenhagenClock(new Date(now)).day) throw new Error('liv_edit_invalid');
  const input = parsed.data, inputHash = cmsFieldHash(input);
  const db = getAdminDb();
  if (!db) throw new Error('liv_edit_store_unavailable');
  const runId = livDailyDocId(input.dayKey, input.scope);
  const run = db.collection(LIV_DAILY_COLLECTION).doc(runId);
  const audit = run.collection('editorialEdits').doc(input.requestId);
  return db.runTransaction(async tx => {
    const state = (await tx.get(db.collection('livDelivery').doc('manifest'))).data();
    const saved = (await tx.get(db.collection('livExplicitPreparations').doc(runId))).data();
    const row = (await tx.get(run)).data();
    const prior = (await tx.get(audit)).data();
    if (state?.preparation?.token !== lease || !Number.isFinite(state?.preparation?.leaseUntil) ||
      state.preparation.leaseUntil <= now) throw new Error('liv_edit_lease_lost');
    if (state.coverRevision || Object.values(state.slots || {}).some(slot =>
      (slot as { state?: unknown })?.state === 'attempted')) throw new Error('liv_edit_delivery_hold');
    if (!saved?.input || saved.input.dayKey !== input.dayKey || saved.inputHash !== cmsFieldHash(saved.input) ||
      row?.dayKey !== input.dayKey || row.explicitPreparationInputHash !== saved.inputHash) throw new Error('liv_edit_conflict');
    // An exact replay acknowledges the immutable receipt, never reapplies an
    // old patch over later work (including a later copyedit or media stage).
    if (prior) {
      if (prior.inputHash !== inputHash) throw new Error('liv_edit_conflict');
      return { status: 'already_edited' as const, runId, requestId: input.requestId, articleHash: prior.articleHash as string };
    }
    const article = row.articleCheckpoint as GeneratedArticle | undefined;
    if (row.status !== 'processing' || row.continuationReady !== true || row.retryAuthorization ||
      row.webflowItemId || row.preparationProof || row.cmsSaveStarted || !article ||
      !['title', 'slug', 'intro', 'content'].every(key => typeof article[key as keyof GeneratedArticle] === 'string') ||
      !article.title.trim() || !article.content.trim() || article.preparedMedia !== undefined || article.selectedImage ||
      /<(?:img|figure|picture)\b/i.test(article.content)) throw new Error('liv_edit_blocked_saved_work');
    if (row.articleCheckpointHash !== input.expectedArticleHash || livImageArticleHash(article) !== input.expectedArticleHash) {
      throw new Error('liv_edit_conflict');
    }
    // Include failed/ambiguous/complete jobs, not just media already attached.
    const media = await tx.get(db.collection('livMediaJobs').where('articleInputHash', '==', input.expectedArticleHash).limit(1));
    if (!media.empty) throw new Error('liv_edit_blocked_saved_work');
    let revised: GeneratedArticle;
    try { revised = applyLivFactPatches(article, { patches: input.patches }); }
    catch { throw new Error('liv_edit_invalid_patch'); }
    const articleHash = livImageArticleHash(revised);
    tx.create(audit, { input, inputHash, previousArticle: article, article: revised,
      previousArticleHash: input.expectedArticleHash, articleHash,
      authority: 'authorized-operator', createdAt: FieldValue.serverTimestamp() });
    tx.update(run, { articleCheckpoint: revised, articleCheckpointHash: articleHash, updatedAt: FieldValue.serverTimestamp() });
    return { status: 'edited' as const, runId, requestId: input.requestId, articleHash };
  });
}
