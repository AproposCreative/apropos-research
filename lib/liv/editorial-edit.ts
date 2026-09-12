import { z } from 'zod';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { applyLivFactPatches } from './fact-revision';
import { applyLivMediaDescriptionCorrections } from './media-description-repair';
import { addDays, copenhagenClock, validDay } from './delivery-policy';
import { LIV_DAILY_COLLECTION, livDailyDocId } from './daily-history-store';
import { cmsFieldHash } from './cms-field-hash';
import { livImageArticleHash } from './article-image-hash';
import type { GeneratedArticle } from './generate-article';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const captionText = z.string().trim().min(10).max(350)
  .refine(value => !/[<>\x00-\x1f]|https?:\/\//i.test(value));
export const editorialEditInput = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  dayKey: z.string().refine(validDay), scope: z.enum(['reserve-editorial', 'prepare']),
  expectedArticleHash: sha256,
  expectedCheckpointHash: sha256.optional(),
  reason: z.string().trim().min(3).max(500).refine(value => !/[<>\x00-\x1f]/.test(value)),
  patches: z.array(z.object({
    field: z.enum(['title', 'subtitle', 'intro', 'content', 'excerpt', 'seoTitle', 'seoDescription']),
    before: z.string().min(1).max(1000), after: z.string().max(1000),
  }).strict()).max(20),
  mediaCaptions: z.array(z.object({ role: z.enum(['body-1', 'body-2']), before: captionText, after: captionText }).strict())
    .min(1).max(2).optional(),
}).strict().refine(input => input.patches.length > 0 || !!input.mediaCaptions?.length);

export function editorialEditDayAllowed(input: z.infer<typeof editorialEditInput>, now = Date.now()) {
  const today = copenhagenClock(new Date(now)).day;
  return input.scope === 'prepare' ? input.dayKey >= today && input.dayKey <= addDays(today, 7) : input.dayKey === today;
}

const omit = (value: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

/** Replace only the canonical caption text, never reserialize the document or
 * touch a credit, image attribute, figure position or non-caption byte. */
export function editPreparedCaptions(article: GeneratedArticle, patches: z.infer<typeof editorialEditInput>['mediaCaptions']) {
  const body = load(article.content);
  if (body('figure').length !== 2 || body('img').length !== 2) throw new Error('liv_edit_blocked_saved_work');
  for (const image of article.preparedMedia!.filter(image => image.role !== 'hero')) {
    const figure = body(`figure[data-liv-media="${image.role}"]`);
    const credit = /^(?:foto|illustration|kilde|credit)\s*:|^©/i.test(image.credit) ? image.credit : `Foto: ${image.credit}`;
    if (figure.length !== 1 || figure.find('img').length !== 1 || figure.find('figcaption').length !== 1 ||
      figure.find('img').attr('src') !== image.url || figure.find('img').attr('alt') !== image.alt ||
      figure.find('figcaption').text() !== `${image.caption} ${credit}`) {
      throw new Error('liv_edit_blocked_saved_work');
    }
  }
  if (!patches) return article;
  if (new Set(patches.map(patch => patch.role)).size !== patches.length) throw new Error('liv_edit_invalid_patch');
  const corrections = patches.map(patch => {
    const image = article.preparedMedia!.find(image => image.role === patch.role);
    if (!image || patch.before !== image.caption || patch.after === patch.before) throw new Error('liv_edit_invalid_patch');
    return { role: patch.role, alt: image.alt, caption: patch.after };
  });
  try { return applyLivMediaDescriptionCorrections(article, { corrections }); }
  catch { throw new Error('liv_edit_invalid_patch'); }
}

/** Operator copyedit only. No provider calls, retry grants or quality approvals.
 * Normal preparation must resume afterward and validate the edited checkpoint. */
export async function editLivEditorialCheckpoint(value: unknown, lease: string, now = Date.now()) {
  const parsed = editorialEditInput.safeParse(value);
  if (!parsed.success || !editorialEditDayAllowed(parsed.data, now)) throw new Error('liv_edit_invalid');
  const input = parsed.data, inputHash = cmsFieldHash(input);
  const db = getAdminDb();
  if (!db) throw new Error('liv_edit_store_unavailable');
  const runId = livDailyDocId(input.dayKey, input.scope);
  const run = db.collection(LIV_DAILY_COLLECTION).doc(runId);
  const audit = run.collection('editorialEdits').doc(input.requestId);
  return db.runTransaction(async tx => {
    const state = (await tx.get(db.collection('livDelivery').doc('manifest'))).data();
    const scheduled = input.scope === 'prepare';
    const saved = scheduled ? undefined : (await tx.get(db.collection('livExplicitPreparations').doc(runId))).data();
    const plan = scheduled ? (await tx.get(db.collection('livDailyPlan').doc(`plan-${input.dayKey}`))).data() : undefined;
    const row = (await tx.get(run)).data();
    const prior = (await tx.get(audit)).data();
    if (state?.preparation?.token !== lease || !Number.isFinite(state?.preparation?.leaseUntil) ||
      state.preparation.leaseUntil <= now) throw new Error('liv_edit_lease_lost');
    if (state.coverRevision || Object.values(state.slots || {}).some(slot =>
      (slot as { state?: unknown })?.state === 'attempted')) throw new Error('liv_edit_delivery_hold');
    if (row?.dayKey !== input.dayKey || (!scheduled && (!saved?.input || saved.input.dayKey !== input.dayKey ||
      saved.inputHash !== cmsFieldHash(saved.input) || row.explicitPreparationInputHash !== saved.inputHash))) throw new Error('liv_edit_conflict');
    // An exact replay acknowledges the immutable receipt, never reapplies an
    // old patch over later work (including a later copyedit or media stage).
    if (prior) {
      if (prior.inputHash !== inputHash) throw new Error('liv_edit_conflict');
      return { status: 'already_edited' as const, runId, requestId: input.requestId, articleHash: prior.articleHash as string };
    }
    const article = row.articleCheckpoint as GeneratedArticle | undefined;
    const postMedia = Array.isArray(article?.preparedMedia) && article.preparedMedia.length === 3 && !!article.selectedImage;
    const yielded = scheduled && row.status === 'processing' && row.continuationReady === true;
    const allowedPlanStatuses = postMedia ? (yielded ? ['failed', 'pending'] : ['failed']) : ['pending'];
    if (scheduled && (plan?.dayKey !== input.dayKey || !allowedPlanStatuses.includes(plan.status) || state.slots?.[input.dayKey] ||
      (state.entries || []).some((entry: { scheduledDay?: string }) => entry.scheduledDay === input.dayKey))) {
      throw new Error('liv_edit_conflict');
    }
    const editableState = postMedia
      ? yielded || (['failed', 'skipped_factcheck', 'skipped_moderation', 'skipped_tov'].includes(row.status) && !row.continuationReady)
      : row.status === 'processing' && row.continuationReady === true;
    if (!editableState || row.retryAuthorization ||
      row.webflowItemId || row.preparationProof || row.cmsSaveStarted || !article ||
      !['title', 'slug', 'intro', 'content'].every(key => typeof article[key as keyof GeneratedArticle] === 'string') ||
      !article.title.trim() || !article.content.trim() || (!postMedia && (article.preparedMedia !== undefined || article.selectedImage ||
      /<(?:img|figure|picture)\b/i.test(article.content)))) throw new Error('liv_edit_blocked_saved_work');
    if (row.articleCheckpointHash !== input.expectedArticleHash || livImageArticleHash(article) !== input.expectedArticleHash) {
      throw new Error('liv_edit_conflict');
    }
    let mediaJobId: string | undefined;
    let previousEditorialEdit: { requestId: string; auditHash: string; receiptHash: string } | undefined;
    const mediaRevisionIds: string[] = [];
    if (postMedia) {
      if (input.expectedCheckpointHash !== cmsFieldHash(article as unknown as Record<string, unknown>) ||
        article.selectedImage!.articleHash !== input.expectedArticleHash ||
        (article.selectedImage!.editorialEdit && !scheduled) ||
        (scheduled && input.mediaCaptions && (!article.selectedImage!.editorialEdit || input.mediaCaptions.some(patch =>
          patch.after !== article.preparedMedia!.find(image => image.role === patch.role)?.alt))) ||
        input.patches.some(patch => patch.field !== 'subtitle' && !(scheduled && patch.field === 'content'))) {
        throw new Error('liv_edit_conflict');
      }
      mediaJobId = article.selectedImage!.id.match(/^([a-f0-9]{64})-hero$/)?.[1];
      if (!mediaJobId) throw new Error('liv_edit_blocked_saved_work');
      const jobRef = db.collection('livMediaJobs').doc(mediaJobId);
      const job = (await tx.get(jobRef)).data();
      if (job?.status !== 'complete' || !job.article ||
        !sha256.safeParse(job.articleInputHash).success || !['photography', 'illustration'].includes(job.mode) ||
        !['expressive', 'minimal'].includes(job.style) || createHash('sha256').update(JSON.stringify([
          'liv-media-v1', input.dayKey, job.articleInputHash, job.mode, job.style])).digest('hex') !== mediaJobId) {
        throw new Error('liv_edit_blocked_saved_work');
      }
      // Completed factual repairs can legitimately change descriptions/text.
      // Follow at most two immutable receipts back to the original media job;
      // never rewrite that job or accept an unrecorded edited checkpoint.
      let ancestor = article;
      if (article.selectedImage!.editorialEdit) {
        const binding = article.selectedImage!.editorialEdit;
        if (binding.runId !== runId || binding.requestId === input.requestId || !/^[a-zA-Z0-9_-]{8,100}$/.test(binding.requestId)) {
          throw new Error('liv_edit_blocked_saved_work');
        }
        const previousRef = run.collection('editorialEdits').doc(binding.requestId);
        const previousAudit = (await tx.get(previousRef)).data();
        const previousReceipt = (await tx.get(previousRef.collection('checks').doc('visual-review'))).data();
        // Exactly one completed predecessor, never an arbitrary chain or a
        // counter that can be reset. Read through this same transaction.
        if (!previousAudit?.previousArticle?.selectedImage || previousAudit.previousArticle.selectedImage.editorialEdit ||
          previousAudit.previousEditorialEdit || !previousReceipt) throw new Error('liv_edit_blocked_saved_work');
        const { reviewLivEditorialEditMedia } = await import('./editorial-edit-media-review');
        const approved = await reviewLivEditorialEditMedia(article, input.dayKey, {
          readOnly: true, read: async ref => (await tx.get(ref)).data(),
        });
        if (cmsFieldHash(approved as unknown as Record<string, unknown>) !== input.expectedCheckpointHash) {
          throw new Error('liv_edit_blocked_saved_work');
        }
        previousEditorialEdit = { requestId: binding.requestId, auditHash: cmsFieldHash(previousAudit), receiptHash: cmsFieldHash(previousReceipt) };
        ancestor = previousAudit.previousArticle as GeneratedArticle;
      }
      while (cmsFieldHash(ancestor as unknown as Record<string, unknown>) !== cmsFieldHash(job.article)) {
        const revisionId = ancestor.factRevisionId;
        if (mediaRevisionIds.length >= 2 || !sha256.safeParse(revisionId).success || mediaRevisionIds.includes(revisionId!)) {
          throw new Error('liv_edit_blocked_saved_work');
        }
        const revision = (await tx.get(db.collection('livFactRevisions').doc(revisionId!))).data();
        if (revision?.status !== 'complete' || !revision.article || !revision.previous ||
          cmsFieldHash(revision.article) !== cmsFieldHash(ancestor as unknown as Record<string, unknown>) ||
          (ancestor.factRevisionCount ?? 1) !== (revision.previous.factRevisionCount ?? (revision.previous.factRevisionId ? 1 : 0)) + 1) {
          throw new Error('liv_edit_blocked_saved_work');
        }
        const proof = revision.descriptionReview ?? revision.visualReview;
        if (proof?.pass !== true || proof.articleHash !== livImageArticleHash(ancestor)) throw new Error('liv_edit_blocked_saved_work');
        mediaRevisionIds.push(revisionId!);
        ancestor = revision.previous as GeneratedArticle;
      }
      const original = job.article as GeneratedArticle;
      const fixedMedia = (images: GeneratedArticle['preparedMedia']) => images?.map(image => omit(image, ['alt', 'caption']));
      if (!original.selectedImage || cmsFieldHash({ images: fixedMedia(article.preparedMedia) }) !== cmsFieldHash({ images: fixedMedia(original.preparedMedia) }) ||
        cmsFieldHash(omit(article.selectedImage!, ['articleHash', 'alt', 'editorialEdit'])) !== cmsFieldHash(omit(original.selectedImage, ['articleHash', 'alt', 'editorialEdit']))) {
        throw new Error('liv_edit_blocked_saved_work');
      }
      const siblings = await tx.get(db.collection('livMediaJobs').where('articleInputHash', '==', job.articleInputHash).limit(2));
      const newer = await tx.get(db.collection('livMediaJobs').where('articleInputHash', '==', input.expectedArticleHash).limit(1));
      if (siblings.size !== 1 || siblings.docs[0].id !== mediaJobId || !newer.empty) throw new Error('liv_edit_blocked_saved_work');
      const roles = new Set<string>(article.preparedMedia!.map(image => image.role));
      if (roles.size !== 3 || !['hero', 'body-1', 'body-2'].every(role => roles.has(role))) throw new Error('liv_edit_blocked_saved_work');
      for (const image of original.preparedMedia!) {
        const stage = (await tx.get(jobRef.collection('stages').doc(image.role))).data();
        if (!stage?.evidence || cmsFieldHash(stage.evidence) !== cmsFieldHash(image)) throw new Error('liv_edit_blocked_saved_work');
      }
      const visual = (await tx.get(jobRef.collection('stages').doc('visual-review'))).data();
      if (visual?.status !== 'complete' || visual.result?.pass !== true) throw new Error('liv_edit_blocked_saved_work');
    } else {
      if (input.mediaCaptions) throw new Error('liv_edit_invalid_patch');
      // Include failed/ambiguous/complete jobs, not just media already attached.
      const media = await tx.get(db.collection('livMediaJobs').where('articleInputHash', '==', input.expectedArticleHash).limit(1));
      if (!media.empty) throw new Error('liv_edit_blocked_saved_work');
    }
    let revised: GeneratedArticle;
    try { revised = input.patches.length ? applyLivFactPatches(article, { patches: input.patches }) : { ...article }; }
    catch { throw new Error('liv_edit_invalid_patch'); }
    if (postMedia) revised = editPreparedCaptions(revised, input.mediaCaptions);
    const articleHash = livImageArticleHash(revised);
    if (postMedia) revised.selectedImage = scheduled
      ? { ...article.selectedImage!, visualReview: 'pending', editorialEdit: { runId, requestId: input.requestId } }
      : { ...article.selectedImage!, articleHash };
    tx.create(audit, { input, inputHash, previousArticle: article, article: revised,
      previousArticleHash: input.expectedArticleHash, articleHash,
      ...(scheduled ? { previousRun: row, previousPlan: plan } : {}),
      ...(previousEditorialEdit ? { previousEditorialEdit } : {}),
      ...(mediaJobId ? { mediaJobId, mediaRevisionIds, previousCheckpointHash: input.expectedCheckpointHash,
        checkpointHash: cmsFieldHash(revised as unknown as Record<string, unknown>) } : {}),
      authority: 'authorized-operator', createdAt: FieldValue.serverTimestamp() });
    tx.update(run, { articleCheckpoint: revised, articleCheckpointHash: articleHash, updatedAt: FieldValue.serverTimestamp() });
    return { status: 'edited' as const, runId, requestId: input.requestId, articleHash };
  });
}
