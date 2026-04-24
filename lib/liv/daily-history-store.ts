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

export const LIV_DAILY_COLLECTION = 'livDailyArticles';

/** Dokument-id til daglig auto-publish: `daily-2026-04-20` (UTC). */
export function livDailyDocId(dayKey: string): string {
  return `daily-${dayKey}`;
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
 * Atomic claim — sætter status `processing` hvis ledigt. `published` er
 * terminal. `skipped_*` og `failed` er retryable; cron'en kan prøve igen
 * (typisk den efterfølgende dag — vi forsøger ikke samme dag igen for at
 * undgå at brænde tokens på en fejlende kilde).
 */
export async function claimLivDaily(dayKey: string): Promise<LivDailyClaimResult> {
  const db = getAdminDb();
  if (!db) return { ok: false, reason: 'no_db' };
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey));

  try {
    let result: LivDailyClaimResult = { ok: false, reason: 'transaction_failed' };
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data();
      const status = d?.status as LivDailyStatus | undefined;

      // Terminal states for *today*.
      if (status === 'published' || status === 'draft') {
        result = { ok: false, reason: 'already_done' };
        return;
      }
      // Skipped/failed today is also terminal — vi venter til næste dag.
      if (status && status.startsWith('skipped_')) {
        result = { ok: false, reason: 'already_done' };
        return;
      }
      if (status === 'failed') {
        result = { ok: false, reason: 'already_done' };
        return;
      }

      if (status === 'processing') {
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

/** skipped: gate blev ikke kørt (infra/mangler input); pass kan stadig være true for ikke at blokere publish. */
export type GateResult = { name: string; pass: boolean; detail?: string; skipped?: boolean };

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
    };

export async function finishLivDaily(dayKey: string, input: FinishLivDailyInput): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(dayKey));

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
      .limit(Math.min(Math.max(limit, 1), 60))
      .get();

    return snap.docs.map((doc) => {
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

/** Topics der allerede er dækket af Liv de seneste N dage — bruges til dedupe. */
export async function getRecentLivDailyTopics(days = 14): Promise<Set<string>> {
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
      const topic = data?.topic;
      if (typeof topic === 'string' && topic.trim()) out.add(topic.trim().toLowerCase());
      if (out.size >= days) break;
    }
  } catch (e) {
    console.warn('[liv/daily] getRecentLivDailyTopics:', e);
  }
  return out;
}
