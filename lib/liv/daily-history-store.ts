/**
 * Firestore-baseret historik for Liv's automatiske daglige artikler.
 *
 * Følger samme `claim → finish` mønster som
 * `lib/newsletter/weekly-send-history.ts` så cron-endpointet ikke kan køre
 * to gange samme dag (Vercel kører cron'en i én region, men retries kan
 * skabe race conditions).
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type { GroundedReport } from '@/lib/factcheck/grounded';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import type { PreparationProof } from '@/lib/liv/prepared-admission';
import { canRetryUnstartedPreparation, shouldExcludeLivTopic } from '@/lib/liv/preparation-retry';

export const LIV_DAILY_COLLECTION = 'livDailyArticles';
export type LivDailyScope = 'daily' | 'prepare' | 'reserve';

/** Dokument-id til daglig auto-publish: `daily-2026-04-20` (UTC). */
export function livDailyDocId(dayKey: string, scope: LivDailyScope = 'daily'): string {
  return `${scope}-${dayKey}`;
}

export type LivDailyStatus =
  | 'processing'
  | 'published'
  | 'draft'
  | 'skipped_no_topic'
  | 'skipped_factcheck'
  | 'skipped_moderation'
  | 'skipped_tov'
  | 'skipped_duplicate'
  | 'failed';

export type LivDailyClaimResult =
  | { ok: true; dayKey: string }
  | { ok: false; reason: 'already_done' | 'already_processing' | 'no_db' | 'transaction_failed' };

const STALE_PROCESSING_MS = 25 * 60 * 1000;

/** YYYY-MM-DD i UTC — bruges til dokument-id. */
export function todayDayKeyUTC(reference = new Date()): string {
  const y = reference.getUTCFullYear();
  const m = String(reference.getUTCMonth() + 1).padStart(2, '0');
  const d = String(reference.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Atomic claim. Daily completed/skipped/failed runs are terminal for this day.
 * Preparation may retry known pre-generation topic failures, bounded to 3 claims.
 * Stale processing without saved work may be reclaimed. Saved article/media
 * work or a CMS ID must be reconciled, not regenerated after a timeout.
 */
export async function claimLivDaily(dayKey: string, scope: LivDailyScope = 'daily'): Promise<LivDailyClaimResult> {
  const db = getAdminDb();
  if (!db) return { ok: false, reason: 'no_db' };
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey, scope));

  try {
    let result: LivDailyClaimResult = { ok: false, reason: 'transaction_failed' };
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data();
      const status = d?.status as LivDailyStatus | undefined;

      const continuation = scope !== 'daily' && d?.continuationReady === true && !!d?.articleCheckpoint &&
        !d?.webflowItemId && !d?.preparationProof;
      const authorizedRetry = scope !== 'daily' && typeof d?.retryAuthorization === 'string';
      const resumableCheckpoint = continuation || authorizedRetry || (scope !== 'daily' && Number(d?.preparationAttempts ?? 0) <= 4 &&
        Array.isArray(d?.articleCheckpoint?.preparedMedia) && d.articleCheckpoint.preparedMedia.length >= 3 &&
        !d?.webflowItemId && !d?.preparationProof);
      if ((typeof d?.webflowItemId === 'string' && d.webflowItemId.trim()) ||
        d?.preparationProof || d?.cmsSaveStarted ||
        ((!resumableCheckpoint) && (d?.articleCheckpoint || d?.articleCheckpointHash || d?.preparationProof))) {
        result = { ok: false, reason: 'already_done' };
        return;
      }

      // Terminal states for *today*.
      if (status === 'published' || status === 'draft') {
        result = { ok: false, reason: 'already_done' };
        return;
      }
      // Only preparation transport/no-topic failures before paid work may retry.
      const retryPreparation = scope !== 'daily' && canRetryUnstartedPreparation(d);
      if (status && status.startsWith('skipped_') && !retryPreparation && !resumableCheckpoint) {
        result = { ok: false, reason: 'already_done' };
        return;
      }
      if (status === 'failed' && !retryPreparation && !resumableCheckpoint) {
        result = { ok: false, reason: 'already_done' };
        return;
      }

      if (status === 'processing' && !continuation) {
        const started = (d?.processingStartedAt as Timestamp | undefined)?.toMillis() ?? 0;
        if (started > 0 && Date.now() - started < STALE_PROCESSING_MS) {
          result = { ok: false, reason: 'already_processing' };
          return;
        }
      }

      tx.set(
        ref,
        {
          dayKey,
          status: 'processing',
          processingStartedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          continuationReady: false,
          retryAuthorization: FieldValue.delete(),
          ...(scope !== 'daily' ? { preparationAttempts: (d?.preparationAttempts ?? 0) + 1 } : {}),
        },
        { merge: true }
      );
      result = { ok: true, dayKey };
    });
    return result;
  } catch (e) {
    console.error('[liv/daily] claimLivDaily transaction error:', e);
    return { ok: false, reason: 'transaction_failed' };
  }
}

/** Yield only after a durable checkpoint. The next API invocation resumes it. */
export async function yieldLivPreparation(dayKey: string, scope: 'prepare' | 'reserve') {
  const db = getAdminDb();
  if (!db) throw new Error('liv_preparation_store_unavailable');
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey, scope));
  await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (row?.status !== 'processing' || !row.articleCheckpoint || row.webflowItemId || row.preparationProof) {
      throw new Error('liv_preparation_yield_conflict');
    }
    tx.set(ref, { continuationReady: true, processingStartedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** Preserve paid text before media work; never silently restart that work. */
export async function checkpointLivDailyArticle(dayKey: string, article: GeneratedArticle, scope: LivDailyScope = 'daily'): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !article.title || !article.content) throw new Error('liv_article_checkpoint_invalid');
  const db = getAdminDb();
  if (!db) throw new Error('liv_article_checkpoint_unavailable');
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey, scope));
  await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (row?.status !== 'processing' || row.webflowItemId) throw new Error('liv_article_checkpoint_conflict');
    tx.set(ref, { articleCheckpoint: JSON.parse(JSON.stringify(article)), articleCheckpointHash: livImageArticleHash(article),
      title: article.title, slug: article.slug, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** Record identity immediately after CMS save, before slow verification/SEO. */
export async function checkpointLivDailyCmsItem(dayKey: string, itemId: string, scope: LivDailyScope = 'daily'): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !/^[a-f0-9]{24}$/i.test(itemId)) {
    throw new Error('liv_cms_checkpoint_invalid');
  }
  const db = getAdminDb();
  if (!db) throw new Error('liv_cms_checkpoint_unavailable');
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey, scope));
  await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (row?.status !== 'processing' || (row.webflowItemId && row.webflowItemId !== itemId)) {
      throw new Error('liv_cms_checkpoint_conflict');
    }
    tx.set(ref, { webflowItemId: itemId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** Before CMS create: a later timeout must not cause a second create. */
export async function checkpointPreparationProof(dayKey: string, scope: 'prepare' | 'reserve', proof: PreparationProof) {
  const db = getAdminDb();
  if (!db) throw new Error('liv_preparation_store_unavailable');
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey, scope));
  await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (row?.status !== 'processing' || row.preparationProof || row.webflowItemId) throw new Error('liv_preparation_proof_conflict');
    tx.set(ref, { preparationProof: JSON.parse(JSON.stringify(proof)), cmsSaveStarted: true }, { merge: true });
  });
}

/** skipped: gate blev ikke kørt (infra/mangler input); pass kan stadig være true for ikke at blokere publish. */
export type GateResult = { name: string; pass: boolean; detail?: string; skipped?: boolean; evidence?: GroundedReport };

export type FinishLivDailyInput =
  | {
      status: 'published' | 'draft';
      topic: string;
      title: string;
      slug: string;
      webflowItemId: string;
      gateResults: GateResult[];
      sourceUrl?: string;
    }
  | {
      status: Exclude<LivDailyStatus, 'published' | 'draft' | 'processing'>;
      topic?: string;
      reason: string;
      gateResults?: GateResult[];
      /** Preserve the staged item after a failed readback; do not blindly recreate it. */
      webflowItemId?: string;
    };

export async function finishLivDaily(dayKey: string, input: FinishLivDailyInput, scope: LivDailyScope = 'daily'): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey, scope));

  if (input.status === 'published' || input.status === 'draft') {
    await ref.set(
      {
        dayKey,
        status: input.status,
        topic: input.topic.slice(0, 500),
        title: input.title.slice(0, 500),
        slug: input.slug.slice(0, 200),
        webflowItemId: input.webflowItemId,
        gateResults: (input.gateResults || []).slice(0, 20),
        sourceUrl: input.sourceUrl?.slice(0, 500) || null,
        completedAt: FieldValue.serverTimestamp(),
        processingStartedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const skippedOrFailed = input as Extract<FinishLivDailyInput, { reason: string }>;
  await ref.set(
    {
      dayKey,
      status: skippedOrFailed.status,
      topic: skippedOrFailed.topic?.slice(0, 500) || null,
      reason: skippedOrFailed.reason.slice(0, 1000),
      ...(skippedOrFailed.webflowItemId ? { webflowItemId: skippedOrFailed.webflowItemId } : {}),
      gateResults: (skippedOrFailed.gateResults || []).slice(0, 20),
      completedAt: FieldValue.serverTimestamp(),
      processingStartedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export type LivDailyLogEntry = {
  id: string;
  dayKey: string;
  status: LivDailyStatus;
  topic?: string | null;
  title?: string | null;
  slug?: string | null;
  webflowItemId?: string | null;
  reason?: string | null;
  gateResults?: GateResult[];
  finishedAt: string | null;
};

function tsToIso(t: Timestamp | undefined): string | null {
  if (!t) return null;
  try {
    return t.toDate().toISOString();
  } catch {
    return null;
  }
}

/** Seneste N dages kørsler — bruges af /api/liv/status. */
export async function listRecentLivDaily(limit = 7): Promise<LivDailyLogEntry[]> {
  const db = getAdminDb();
  if (!db) return [];

  try {
    const snap = await db
      .collection(LIV_DAILY_COLLECTION)
      .orderBy('completedAt', 'desc')
      .limit(Math.min(Math.max(limit, 1), 60) * 3)
      .get();

    return snap.docs.filter(doc => doc.id.startsWith('daily-')).slice(0, Math.min(Math.max(limit, 1), 60)).map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        dayKey: typeof d.dayKey === 'string' ? d.dayKey : doc.id.replace(/^daily-/, ''),
        status: (d.status as LivDailyStatus) || 'failed',
        topic: typeof d.topic === 'string' ? d.topic : null,
        title: typeof d.title === 'string' ? d.title : null,
        slug: typeof d.slug === 'string' ? d.slug : null,
        webflowItemId: typeof d.webflowItemId === 'string' ? d.webflowItemId : null,
        reason: typeof d.reason === 'string' ? d.reason : null,
        gateResults: Array.isArray(d.gateResults) ? (d.gateResults as GateResult[]) : [],
        finishedAt: tsToIso(d.completedAt as Timestamp | undefined),
      };
    });
  } catch (e) {
    console.warn('[liv/daily] listRecentLivDaily:', e);
    return [];
  }
}

/** Slug'er der allerede er publiceret de seneste N dage — bruges til dedupe. */
export async function getRecentLivDailySlugs(days = 14): Promise<Set<string>> {
  const out = new Set<string>();
  const db = getAdminDb();
  if (!db) return out;

  try {
    const snap = await db
      .collection(LIV_DAILY_COLLECTION)
      .orderBy('completedAt', 'desc')
      .limit(Math.min(Math.max(days * 4, days), 120))
      .get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data?.status !== 'published') continue;
      const slug = data?.slug;
      if (typeof slug === 'string' && slug.trim()) out.add(slug.trim().toLowerCase());
      if (out.size >= days) break;
    }
  } catch (e) {
    console.warn('[liv/daily] getRecentLivDailySlugs:', e);
  }
  return out;
}

/** Topics der allerede er dækket eller afvist i Livs seneste køforsøg — dedupe. */
export async function getRecentLivDailyTopics(days = 14, currentRunId?: string): Promise<Set<string>> {
  const out = new Set<string>();
  const db = getAdminDb();
  if (!db) return out;

  try {
    const snap = await db
      .collection(LIV_DAILY_COLLECTION)
      .orderBy('completedAt', 'desc')
      .limit(Math.min(Math.max(days * 4, days), 120))
      .get();
    for (const doc of snap.docs) {
      // A claimed retry of this very run is not a duplicate of another article.
      // All other saved, published and rejected topics remain excluded.
      if (doc.id === currentRunId) continue;
      const data = doc.data();
      if (!shouldExcludeLivTopic(data)) continue;
      const topic = data?.topic;
      if (typeof topic === 'string' && topic.trim()) out.add(topic.trim().toLowerCase());
      if (out.size >= days) break;
    }
  } catch (e) {
    console.warn('[liv/daily] getRecentLivDailyTopics:', e);
  }
  return out;
}
