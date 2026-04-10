import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

export const WEEKLY_SEND_COLLECTION = 'newsletterWeeklySends';

/** Auto-fredag: dokument-id `auto-2026-W15` (ISO-uge for send-dato i København). */
export function weeklyAutoDocId(weekKey: string): string {
  return `auto-${weekKey}`;
}

export type WeeklySendStatus = 'processing' | 'sent' | 'failed' | 'skipped';

export type WeeklyAutoClaimResult =
  | { ok: true; weekKey: string }
  | { ok: false; reason: 'already_done' | 'already_processing' | 'no_db' | 'transaction_failed' };

const STALE_PROCESSING_MS = 25 * 60 * 1000;

/** Skip reasons that should NOT block retries within the same ISO week. */
const RETRYABLE_SKIP_REASONS = new Set([
  'no_recipients',
  'Ingen aktive modtagere',
  'Ingen afsendelse blev registreret',
]);

function isRetryableSkip(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const reason = data.skipReason;
  if (typeof reason !== 'string') return false;
  for (const r of RETRYABLE_SKIP_REASONS) {
    if (reason.includes(r)) return true;
  }
  return false;
}

/**
 * Atomisk: må kun køre ét auto-send pr. weekKey. Sætter processing hvis ledig.
 * `sent` er terminal. `failed` og retryable `skipped` (fx no_recipients) tillader retry.
 */
export async function claimWeeklyAutoSend(weekKey: string): Promise<WeeklyAutoClaimResult> {
  const db = getAdminDb();
  if (!db) return { ok: false, reason: 'no_db' };
  const id = weeklyAutoDocId(weekKey);
  const ref = db.collection(WEEKLY_SEND_COLLECTION).doc(id);

  try {
    let result: WeeklyAutoClaimResult = { ok: false, reason: 'transaction_failed' };
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data();
      const status = d?.status as WeeklySendStatus | undefined;

      if (status === 'sent') {
        result = { ok: false, reason: 'already_done' };
        return;
      }

      if (status === 'skipped' && !isRetryableSkip(d)) {
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
          weekKey,
          kind: 'weekly_auto',
          status: 'processing',
          processingStartedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      result = { ok: true, weekKey };
    });
    return result;
  } catch (e) {
    console.error('[newsletter/weekly-history] claimWeeklyAutoSend transaction error:', e);
    return { ok: false, reason: 'transaction_failed' };
  }
}

export type FinishWeeklyAutoInput =
  | {
      status: 'sent';
      articleIds: string[];
      subject: string;
      recipientCount: number;
      sent: number;
      failed: number;
      warnings?: string[];
    }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string };

export async function finishWeeklyAutoSend(weekKey: string, input: FinishWeeklyAutoInput): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection(WEEKLY_SEND_COLLECTION).doc(weeklyAutoDocId(weekKey));

  if (input.status === 'sent') {
    await ref.set(
      {
        weekKey,
        kind: 'weekly_auto',
        status: 'sent',
        articleIds: input.articleIds,
        subject: input.subject.slice(0, 500),
        recipientCount: input.recipientCount,
        sent: input.sent,
        failed: input.failed,
        warnings: input.warnings?.slice(0, 20) ?? [],
        completedAt: FieldValue.serverTimestamp(),
        processingStartedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  if (input.status === 'skipped') {
    await ref.set(
      {
        weekKey,
        kind: 'weekly_auto',
        status: 'skipped',
        skipReason: input.reason.slice(0, 500),
        completedAt: FieldValue.serverTimestamp(),
        processingStartedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  await ref.set(
    {
      weekKey,
      kind: 'weekly_auto',
      status: 'failed',
      error: input.error.slice(0, 2000),
      completedAt: FieldValue.serverTimestamp(),
      processingStartedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Union af articleIds fra de seneste `maxSends` vellykkede auto-sends (til ekskludering). */
export async function getRecentWeeklyAutoArticleIds(maxSends: number): Promise<Set<string>> {
  const db = getAdminDb();
  const out = new Set<string>();
  if (!db || maxSends <= 0) return out;

  try {
    const snap = await db
      .collection(WEEKLY_SEND_COLLECTION)
      .where('kind', '==', 'weekly_auto')
      .where('status', '==', 'sent')
      .orderBy('completedAt', 'desc')
      .limit(Math.min(maxSends, 52))
      .get();

    for (const doc of snap.docs) {
      const ids = doc.data()?.articleIds;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === 'string' && id.trim()) out.add(id.trim());
      }
    }
  } catch (e) {
    console.warn('[newsletter/weekly-history] getRecentWeeklyAutoArticleIds:', e);
  }
  return out;
}

/**
 * Single-query variant: fetches `fullLimit` recent sent docs and derives both
 * a full exclusion set and a relaxed (smaller) exclusion set from the same result.
 */
export async function getRecentWeeklyAutoExclusionSets(
  fullLimit: number,
  relaxLimit: number
): Promise<{ excludeFull: Set<string>; excludeRelax: Set<string> }> {
  const excludeFull = new Set<string>();
  const excludeRelax = new Set<string>();
  const db = getAdminDb();
  if (!db || fullLimit <= 0) return { excludeFull, excludeRelax };

  const effectiveRelax = Math.min(relaxLimit, fullLimit);

  try {
    const snap = await db
      .collection(WEEKLY_SEND_COLLECTION)
      .where('kind', '==', 'weekly_auto')
      .where('status', '==', 'sent')
      .orderBy('completedAt', 'desc')
      .limit(Math.min(fullLimit, 52))
      .get();

    for (let i = 0; i < snap.docs.length; i++) {
      const ids = snap.docs[i]!.data()?.articleIds;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id !== 'string' || !id.trim()) continue;
        const trimmed = id.trim();
        excludeFull.add(trimmed);
        if (i < effectiveRelax) excludeRelax.add(trimmed);
      }
    }
  } catch (e) {
    console.warn('[newsletter/weekly-history] getRecentWeeklyAutoExclusionSets:', e);
  }
  return { excludeFull, excludeRelax };
}

/** Første artikel-id fra seneste vellykkede auto-send (forside/hero) — til at undgå samme lead to uger i træk. */
export async function getLastWeeklyAutoLeadArticleId(): Promise<string | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db
      .collection(WEEKLY_SEND_COLLECTION)
      .where('kind', '==', 'weekly_auto')
      .where('status', '==', 'sent')
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();
    const doc = snap.docs[0];
    if (!doc) return null;
    const ids = doc.data()?.articleIds;
    if (!Array.isArray(ids) || ids.length === 0) return null;
    const first = ids[0];
    return typeof first === 'string' && first.trim() ? first.trim() : null;
  } catch (e) {
    console.warn('[newsletter/weekly-history] getLastWeeklyAutoLeadArticleId:', e);
    return null;
  }
}

export type WeeklyAutoLogEntry = {
  id: string;
  weekKey: string;
  status: 'sent' | 'failed' | 'skipped';
  finishedAt: string;
  subject?: string;
  sent?: number;
  recipientCount?: number;
  skipReason?: string;
  error?: string;
};

function tsToIso(t: Timestamp | undefined): string | null {
  if (!t) return null;
  try {
    return t.toDate().toISOString();
  } catch {
    return null;
  }
}

/** Aktuel uges auto-send-dokument til planlægningsvisning (pending/processing/sent/failed/skipped). */
export type WeeklyAutoPlanDoc = {
  status: WeeklySendStatus;
  subject?: string;
  error?: string;
  skipReason?: string;
  completedAt: string | null;
  processingStartedAt: string | null;
};

const CRON_NO_RUN_SKIP =
  'Ingen afsendelse blev registreret efter planlagt tid. Kontakt den tekniske ansvarlige ved gentagne problemer.';

/**
 * Opretter ét skipped-dokument for ugen hvis der slet ikke findes et endnu — bruges når planlagt tid er passeret med buffer,
 * så UI kan vise årsag og aktivitetslog. Atomisk: skriver kun hvis dokumentet mangler (undgår race med rigtig cron).
 */
export async function tryRecordWeeklyCronNoRun(weekKey: string, skipReason = CRON_NO_RUN_SKIP): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;
  const ref = db.collection(WEEKLY_SEND_COLLECTION).doc(weeklyAutoDocId(weekKey));

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, {
        weekKey,
        kind: 'weekly_auto',
        status: 'skipped',
        skipReason: skipReason.slice(0, 500),
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
  } catch {
    return false;
  }
}

export async function readWeeklyAutoPlanDoc(weekKey: string): Promise<WeeklyAutoPlanDoc | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db.collection(WEEKLY_SEND_COLLECTION).doc(weeklyAutoDocId(weekKey)).get();
    if (!snap.exists) return null;
    const d = snap.data() as Record<string, unknown>;
    const st = d.status as WeeklySendStatus | undefined;
    if (!st) return null;
    return {
      status: st,
      subject: typeof d.subject === 'string' ? d.subject : undefined,
      error: typeof d.error === 'string' ? d.error : undefined,
      skipReason: typeof d.skipReason === 'string' ? d.skipReason : undefined,
      completedAt: tsToIso(d.completedAt as Timestamp | undefined),
      processingStartedAt: tsToIso(d.processingStartedAt as Timestamp | undefined),
    };
  } catch (e) {
    console.warn('[newsletter/weekly-history] readWeeklyAutoPlanDoc:', e);
    return null;
  }
}

/** Seneste auto-ugemails til aktivitetslog (kræver indeks kind+status+completedAt). */
export async function listRecentWeeklyAutoSends(perStatusLimit = 8): Promise<WeeklyAutoLogEntry[]> {
  const db = getAdminDb();
  if (!db) return [];

  const statuses: Array<'sent' | 'failed' | 'skipped'> = ['sent', 'failed', 'skipped'];
  const snaps = await Promise.all(
    statuses.map((st) =>
      db
        .collection(WEEKLY_SEND_COLLECTION)
        .where('kind', '==', 'weekly_auto')
        .where('status', '==', st)
        .orderBy('completedAt', 'desc')
        .limit(Math.min(perStatusLimit, 25))
        .get()
        .catch((e) => {
          console.warn('[newsletter/weekly-history] listRecentWeeklyAutoSends:', e);
          return null;
        })
    )
  );

  const out: WeeklyAutoLogEntry[] = [];
  for (const snap of snaps) {
    if (!snap) continue;
    for (const doc of snap.docs) {
      const d = doc.data();
      const finishedAt = tsToIso(d.completedAt as Timestamp | undefined);
      if (!finishedAt) continue;
      const weekKey = typeof d.weekKey === 'string' ? d.weekKey : doc.id.replace(/^auto-/, '');
      const base: WeeklyAutoLogEntry = {
        id: doc.id,
        weekKey,
        status: d.status as 'sent' | 'failed' | 'skipped',
        finishedAt,
      };
      if (d.status === 'sent') {
        out.push({
          ...base,
          subject: typeof d.subject === 'string' ? d.subject : undefined,
          sent: typeof d.sent === 'number' ? d.sent : undefined,
          recipientCount: typeof d.recipientCount === 'number' ? d.recipientCount : undefined,
        });
      } else if (d.status === 'failed') {
        out.push({
          ...base,
          error: typeof d.error === 'string' ? d.error : undefined,
        });
      } else {
        out.push({
          ...base,
          skipReason: typeof d.skipReason === 'string' ? d.skipReason : undefined,
        });
      }
    }
  }

  out.sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : a.finishedAt > b.finishedAt ? -1 : 0));
  return out.slice(0, 24);
}
