import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

export const LIV_DAILY_PLAN_COLLECTION = 'livDailyPlan';

export type LivDailyPlanStatus = 'pending' | 'used' | 'failed';

export interface LivDailyPlan {
  dayKey: string;
  topicHint?: string;
  directiveHint?: string;
  expandedDirective?: string;
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
    mustUseTrending: d.mustUseTrending !== false,
    status: (d.status as LivDailyPlanStatus) || 'pending',
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
    usedAt: tsToIso(d.usedAt),
    failedReason: typeof d.failedReason === 'string' ? d.failedReason : null,
    createdBy: typeof d.createdBy === 'string' ? d.createdBy : null,
  };
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
