import { createHash } from 'node:crypto';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { LIV_DAILY_COLLECTION, livDailyDocId } from '@/lib/liv/daily-history-store';
import { validDay } from '@/lib/liv/delivery-policy';
import { explicitPreparationInput } from '@/lib/liv/explicit-preparation';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { loadRecoverableWritingBrief } from '@/lib/liv/source-archive';
import { parseLivArticleOutput } from '@/lib/liv/article-output';
import type { LivDailyPlan } from '@/lib/liv/daily-plan-store';
import { isLivArticleFormat, type LivArticleFormat } from '@/lib/liv/review-format';
import { isLivEditorialKind, type LivEditorialKind } from '@/lib/liv/editorial-kind';

export type PreparationRetry = { dayKey: string; kind: 'scheduled' | 'reserve'; requestId: string; reason: string;
  plan?: { topicHint: string; directiveHint: string; articleFormat?: LivArticleFormat; editorialKind?: LivEditorialKind }; resumeWritingRunId?: string; scope?: 'prepare-alternative' | 'reserve-editorial';
  allowOriginalityRevision?: true };

/** Explicit operator retry, not a reset. Retain the full previous run and paid
 * checkpoints. A replayed request never grants a second attempt. CMS writes
 * with uncertain outcomes must use reconciliation, never this operation. */
export async function authorizePreparationRetry(input: PreparationRetry, lease?: string) {
  const explicit = input.scope === 'reserve-editorial';
  if (!validDay(input.dayKey) || !['scheduled', 'reserve'].includes(input.kind) ||
    (input.scope !== undefined && (input.plan || (explicit ? input.kind !== 'reserve' :
      input.scope !== 'prepare-alternative' || input.kind !== 'scheduled'))) ||
    (input.allowOriginalityRevision !== undefined && (!explicit || input.allowOriginalityRevision !== true || !input.resumeWritingRunId)) ||
    (explicit && (!lease || Object.keys(input).some(key => !['dayKey', 'kind', 'scope', 'requestId', 'reason', 'resumeWritingRunId', 'allowOriginalityRevision'].includes(key)))) ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) || !input.reason?.trim() || input.reason.length > 500) {
    throw new Error('liv_retry_invalid');
  }
  if (input.plan && (input.kind !== 'scheduled' || typeof input.plan.topicHint !== 'string' ||
    typeof input.plan.directiveHint !== 'string' || input.plan.topicHint.length > 500 || input.plan.directiveHint.length > 6000 ||
    (input.plan.articleFormat !== undefined && !isLivArticleFormat(input.plan.articleFormat)) ||
    (input.plan.editorialKind !== undefined && (!isLivEditorialKind(input.plan.editorialKind) || input.plan.articleFormat === 'research-review')))) {
    throw new Error('liv_retry_invalid');
  }
  if (input.resumeWritingRunId && (input.plan || !/^[a-f0-9-]{36}$/.test(input.resumeWritingRunId))) {
    throw new Error('liv_retry_invalid');
  }
  const db = getAdminDb();
  if (!db) throw new Error('liv_retry_store_unavailable');
  const scope = input.scope || (input.kind === 'reserve' ? 'reserve' : 'prepare');
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(input.dayKey, scope));
  const audit = ref.collection('retryRequests').doc(createHash('sha256').update(input.requestId).digest('hex'));
  const planRef = db.collection('livDailyPlan').doc(`plan-${input.dayKey}`);
  const retryInputHash = cmsFieldHash(input);
  const reservationRef = db.collection('livExplicitPreparations').doc(livDailyDocId(input.dayKey, 'reserve-editorial'));
  let recovery: { rowHash: string; reservationHash: string; defaultPlan: LivDailyPlan;
    checkpointHash?: string; checkpointEvidenceHash?: string;
    writing?: { writerHash: string; writerRef: DocumentReference; pointerRef: DocumentReference } } | undefined;
  if (explicit) {
    const previous = await audit.get();
    if (previous.exists) {
      if (previous.data()?.retryInputHash !== retryInputHash) throw new Error('liv_retry_conflict');
      return { status: 'already_requested' as const };
    }
    const [savedRun, reservation] = await Promise.all([ref.get(), reservationRef.get()]);
    const row = savedRun.data(), saved = reservation.data();
    const parsed = explicitPreparationInput.safeParse(saved?.input);
    if (!row || !parsed.success || parsed.data.dayKey !== input.dayKey ||
      saved?.inputHash !== cmsFieldHash(parsed.data) || row.explicitPreparationInputHash !== saved.inputHash ||
      row.dayKey !== input.dayKey || typeof row.topic !== 'string' || !row.topic.trim()) throw new Error('liv_retry_conflict');
    recovery = { rowHash: cmsFieldHash(row), reservationHash: cmsFieldHash(saved!),
      defaultPlan: { dayKey: input.dayKey, topicHint: parsed.data.topicHint, directiveHint: parsed.data.directiveHint,
        ...(parsed.data.editorialKind ? { editorialKind: parsed.data.editorialKind } : {}),
        articleFormat: parsed.data.articleFormat, mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null } };
    if (!input.resumeWritingRunId) {
      const article = row.articleCheckpoint;
      // This grants continuation of owned paid work, not regeneration or approval.
      // The whole snapshot (including media and failed gates) is rechecked below.
      if (!['failed', 'skipped_factcheck', 'skipped_moderation', 'skipped_tov'].includes(row.status) ||
        !article || !['title', 'slug', 'intro', 'content'].every(key => typeof article[key] === 'string') ||
        !article.title.trim() || !article.content.trim() || row.articleCheckpointHash !== livImageArticleHash(article)) {
        throw new Error('liv_retry_conflict');
      }
      recovery.checkpointHash = row.articleCheckpointHash;
      recovery.checkpointEvidenceHash = cmsFieldHash(article);
    } else {
      if (row.status !== 'failed' || row.articleCheckpoint || row.articleCheckpointHash ||
        !/^source_similarity_(unapproved|incomplete):/.test(row.reason || '')) throw new Error('liv_retry_conflict');
      // Read/validate existing paid output only. This performs no source or model calls.
      const brief = await loadRecoverableWritingBrief('liv-daily', row.topic, input.resumeWritingRunId);
      if (brief.articleFormat !== parsed.data.articleFormat || brief.finishReason !== 'stop' || brief.refusal) throw new Error('liv_retry_conflict');
      if (input.allowOriginalityRevision && brief.parentRunId) throw new Error('liv_retry_conflict');
      try { parseLivArticleOutput(brief.rawResponse, brief.articleFormat); }
      catch { throw new Error('liv_retry_conflict'); }
      const hash = (text: string) => createHash('sha256').update(text).digest('hex');
      const desk = db.collection('livSourceArchives').doc(hash('liv-daily'));
      const writerRef = desk.collection('runs').doc(input.resumeWritingRunId);
      const pointerRef = desk.collection('topics').doc(hash(row.topic.toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()));
      // Recheck the exact archive snapshot in the authorization transaction below.
      const writer = (await writerRef.get()).data();
      if (!writer || cmsFieldHash(Object.fromEntries(Object.keys(brief).map(key => [key, writer[key]]))) !== cmsFieldHash(brief)) {
        throw new Error('liv_retry_conflict');
      }
      recovery.writing = { writerHash: cmsFieldHash(writer), writerRef, pointerRef };
    }
  }
  return db.runTransaction(async tx => {
    const previous = await tx.get(audit);
    const row = (await tx.get(ref)).data();
    const previousPlan = input.plan ? (await tx.get(planRef)).data() : null;
    if (previous.exists) {
      if (explicit && previous.data()?.retryInputHash !== retryInputHash) throw new Error('liv_retry_conflict');
      return { status: 'already_requested' as const };
    }
    if (recovery) {
      const manifest = (await tx.get(db.collection('livDelivery').doc('manifest'))).data();
      const reservation = (await tx.get(reservationRef)).data();
      if (recovery.writing) {
        const writer = (await tx.get(recovery.writing.writerRef)).data();
        const pointer = (await tx.get(recovery.writing.pointerRef)).data();
        if (!writer || cmsFieldHash(writer) !== recovery.writing.writerHash ||
          pointer?.latestBrief?.runId !== input.resumeWritingRunId) throw new Error('liv_retry_conflict');
      }
      if (!manifest || manifest.preparation?.token !== lease || !Number.isFinite(manifest.preparation?.leaseUntil) ||
        manifest.preparation.leaseUntil <= Date.now() || manifest.coverRevision ||
        Object.values(manifest.slots || {}).some(slot => (slot as { state?: unknown })?.state === 'attempted') ||
        !row || !reservation || cmsFieldHash(row) !== recovery.rowHash ||
        cmsFieldHash(reservation) !== recovery.reservationHash) throw new Error('liv_retry_conflict');
    }
    if (!row || row.status === 'published' || row.status === 'draft' || row.webflowItemId ||
      row.preparationProof || row.cmsSaveStarted || row.retryAuthorization || row.continuationReady) {
      throw new Error('liv_retry_conflict');
    }
    if (input.plan && (row.articleCheckpoint || row.articleCheckpointHash)) throw new Error('liv_retry_conflict');
    if (input.resumeWritingRunId && (row.articleCheckpoint || !row.topic)) throw new Error('liv_retry_conflict');
    // A live worker owns its run, including the gap before its first checkpoint.
    if (row.status === 'processing' && Date.now() - (row.processingStartedAt?.toMillis?.() || 0) < 25 * 60_000) {
      throw new Error('liv_retry_processing');
    }
    tx.create(audit, { reason: input.reason.trim(), previous: row, previousPlan: previousPlan ?? null,
      requestedAt: FieldValue.serverTimestamp(),
      authorizedBy: 'cron-authenticated-operator', requestId: input.requestId,
      resumeWritingRunId: input.resumeWritingRunId || null,
      ...(recovery ? { retryInputHash, reservedPlan: recovery.defaultPlan,
        explicitPreparationInputHash: row.explicitPreparationInputHash,
        ...(recovery.writing ? { writingEvidenceHash: recovery.writing.writerHash } : {
          articleCheckpointHash: recovery.checkpointHash, checkpointEvidenceHash: recovery.checkpointEvidenceHash }),
        allowOriginalityRevision: input.allowOriginalityRevision === true } : {}) });
    if (input.plan) tx.set(planRef, { dayKey: input.dayKey, topicHint: input.plan.topicHint.trim() || null,
      directiveHint: input.plan.directiveHint.trim() || null, expandedDirective: null, articleFormat: input.plan.articleFormat || 'article',
      ...(input.plan.editorialKind ? { editorialKind: input.plan.editorialKind } : {}),
      mustUseTrending: false, status: 'pending', failedReason: null, usedAt: null,
      updatedAt: FieldValue.serverTimestamp(), createdAt: previousPlan?.createdAt ?? FieldValue.serverTimestamp(),
      createdBy: 'liv-api-operator' });
    tx.set(ref, { retryAuthorization: audit.id, updatedAt: FieldValue.serverTimestamp(),
      // An unflagged explicit retry must not inherit a previous edit permission.
      ...(explicit ? { allowOriginalityRevision: input.allowOriginalityRevision === true } : {}),
      ...(input.resumeWritingRunId ? { resumeWritingRunId: input.resumeWritingRunId } : {}) }, { merge: true });
    return { status: 'retry_authorized' as const, ...(recovery ? { defaultPlan: recovery.defaultPlan } : {}) };
  });
}
