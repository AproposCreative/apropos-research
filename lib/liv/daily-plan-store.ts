import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { isLivArticleFormat, type LivArticleFormat } from '@/lib/liv/review-format';

export const LIV_DAILY_PLAN_COLLECTION = 'livDailyPlan';

export type LivDailyPlanStatus = 'pending' | 'used' | 'failed';

export interface LivDailyPlan {
  dayKey: string;
  topicHint?: string;
  directiveHint?: string;
  expandedDirective?: string;
  articleFormat?: LivArticleFormat;
  mustUseTrending: boolean;
  status: LivDailyPlanStatus;
  createdAt: string | null;
  updatedAt: string | null;
  usedAt?: string | null;
  failedReason?: string | null;
  createdBy?: string | null;
}

function planDocId(dayKey: string): string {
  return `plan-${dayKey}`;
}

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  return null;
}

export async function setLivDailyPlan(input: {
  dayKey: string;
  topicHint?: string;
  directiveHint?: string;
  expandedDirective?: string;
  articleFormat?: LivArticleFormat;
  mustUseTrending: boolean;
  createdBy?: string;
}): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection(LIV_DAILY_PLAN_COLLECTION).doc(planDocId(input.dayKey));
  await ref.set(
    {
      dayKey: input.dayKey,
      topicHint: input.topicHint?.trim() || null,
      directiveHint: input.directiveHint?.trim() || null,
      expandedDirective: input.expandedDirective?.trim() || null,
      articleFormat: input.articleFormat || 'article',
      mustUseTrending: input.mustUseTrending,
      status: 'pending',
      failedReason: null,
      usedAt: null,
      createdBy: input.createdBy || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getLivDailyPlan(dayKey: string): Promise<LivDailyPlan | null> {
  const db = getAdminDb();
  if (!db) return null;
  const ref = db.collection(LIV_DAILY_PLAN_COLLECTION).doc(planDocId(dayKey));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  return {
    dayKey: typeof d.dayKey === 'string' ? d.dayKey : dayKey,
    topicHint: typeof d.topicHint === 'string' ? d.topicHint : undefined,
    directiveHint: typeof d.directiveHint === 'string' ? d.directiveHint : undefined,
    expandedDirective: typeof d.expandedDirective === 'string' ? d.expandedDirective : undefined,
    // Missing format on new automatic plans means select after the topic is known.
    // Existing explicit article/review choices are never reinterpreted.
    articleFormat: isLivArticleFormat(d.articleFormat) ? d.articleFormat : undefined,
    mustUseTrending: d.mustUseTrending !== false,
    status: (d.status as LivDailyPlanStatus) || 'pending',
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
    usedAt: tsToIso(d.usedAt),
    failedReason: typeof d.failedReason === 'string' ? d.failedReason : null,
    createdBy: typeof d.createdBy === 'string' ? d.createdBy : null,
  };
}

/** Create only missing defaults; a concurrent editor's plan always wins. */
export async function ensureLivDailyPlan(plan: LivDailyPlan): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('liv_plan_store_unavailable');
  const ref = db.collection(LIV_DAILY_PLAN_COLLECTION).doc(planDocId(plan.dayKey));
  await db.runTransaction(async tx => {
    if ((await tx.get(ref)).exists) return;
    tx.create(ref, { ...plan, createdBy: 'liv-rolling-plan', createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function clearLivDailyPlan(dayKey: string): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection(LIV_DAILY_PLAN_COLLECTION).doc(planDocId(dayKey)).delete();
}

export async function markPlanUsed(dayKey: string): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db
    .collection(LIV_DAILY_PLAN_COLLECTION)
    .doc(planDocId(dayKey))
    .set(
      {
        status: 'used',
        usedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

export async function markPlanFailed(dayKey: string, reason: string): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db
    .collection(LIV_DAILY_PLAN_COLLECTION)
    .doc(planDocId(dayKey))
    .set(
      {
        status: 'failed',
        failedReason: reason.slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}
