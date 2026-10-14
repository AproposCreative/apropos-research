import { AsyncLocalStorage } from 'node:async_hooks';
import { getAdminDb } from '@/lib/firebase-admin';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
import type { LivCostContext } from '@/lib/liv/cost-context';

export const MANUAL_WRITER_BUDGET_ID = 'manual-writer-50dkk-2026-10-14-v1';
export const MANUAL_WRITER_LIMIT = 50_000_000;
const identity = new AsyncLocalStorage<string>();
/** Only the authenticated interactive route establishes this. Not serialized in HTTP/job context. */
export function withManualWriterIdentity<T>(uid: string, run: () => T): T {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) throw new Error('manual_writer_identity_invalid');
  return identity.run(uid, run);
}
export const manualWriterUid = () => identity.getStore();
export type ManualWriterBudget = {
  id: typeof MANUAL_WRITER_BUDGET_ID; mode: 'manual-writer-only-v1'; limitDkkMicros: number;
  committedDkkMicros: number; reservedDkkMicros: number; calls: number; unknownCalls: number;
  activatedAt: string; activatedBy: string; blocked: boolean; updatedAt: string;
};
export const manualWriterBudgetRef = (db: NonNullable<ReturnType<typeof getAdminDb>>) => db.collection('aiExecutionPolicies').doc('paid');
export function validateManualWriterBudget(value: unknown): ManualWriterBudget {
  const row = value as ManualWriterBudget | undefined;
  if (!row || row.id !== MANUAL_WRITER_BUDGET_ID || row.mode !== 'manual-writer-only-v1' ||
    row.limitDkkMicros !== MANUAL_WRITER_LIMIT ||
    ![row.committedDkkMicros, row.reservedDkkMicros, row.calls, row.unknownCalls].every(n => Number.isSafeInteger(n) && n >= 0) ||
    typeof row.blocked !== 'boolean' || !row.activatedBy || !Number.isFinite(Date.parse(row.activatedAt))) {
    throw new LivCostPretransportError('liv_cost_manual_writer_policy_invalid');
  }
  return row;
}
export async function readManualWriterBudget(): Promise<ManualWriterBudget | null> {
  const db = getAdminDb();
  if (!db) throw new Error('manual_writer_store_unavailable');
  const data = (await manualWriterBudgetRef(db).get()).data();
  return data === undefined ? null : validateManualWriterBudget(data);
}
/** A fixed, one-time authorization. Replays cannot reset usage or replenish the allowance. */
export async function activateManualWriterBudget(uid: string, now = new Date()): Promise<ManualWriterBudget> {
  const db = getAdminDb();
  if (!db) throw new Error('manual_writer_store_unavailable');
  return db.runTransaction(async tx => {
    const ref = manualWriterBudgetRef(db), old = (await tx.get(ref)).data();
    if (old !== undefined) return validateManualWriterBudget(old);
    const row: ManualWriterBudget = { id: MANUAL_WRITER_BUDGET_ID, mode: 'manual-writer-only-v1',
      limitDkkMicros: MANUAL_WRITER_LIMIT, committedDkkMicros: 0, reservedDkkMicros: 0, calls: 0, unknownCalls: 0,
      activatedAt: now.toISOString(), activatedBy: uid, blocked: false, updatedAt: now.toISOString() };
    tx.create(ref, row);
    return row;
  });
}
export function assertManualWriterReservation(row: ManualWriterBudget, context: LivCostContext, bucket: string, model: string, amount: number) {
  if (!manualWriterUid() || context.scope !== 'writer' || bucket !== 'liv' || context.submissionId ||
    context.purpose === 'development-pilot' || /image|tts|whisper|audio|video/i.test(model)) {
    throw new LivCostPretransportError('liv_cost_manual_writer_only');
  }
  if (row.blocked || !Number.isSafeInteger(amount) || amount <= 0 ||
    row.committedDkkMicros + row.reservedDkkMicros + amount > row.limitDkkMicros) {
    throw new LivCostPretransportError('liv_cost_manual_writer_budget_exceeded');
  }
}
export function manualWriterBudgetStatus(row: ManualWriterBudget | null) {
  return { configured: !!row, mode: row?.mode ?? null, budgetId: row?.id ?? null,
    limitDkk: row ? row.limitDkkMicros / 1e6 : null,
    usageBasedUpperDkk: row ? row.committedDkkMicros / 1e6 : null,
    reservedUpperDkk: row ? row.reservedDkkMicros / 1e6 : null,
    remainingDkk: row ? Math.max(0, row.limitDkkMicros - row.committedDkkMicros - row.reservedDkkMicros) / 1e6 : null,
    calls: row?.calls ?? null, unknownCalls: row?.unknownCalls ?? null, blocked: row?.blocked ?? true,
    resetsAutomatically: false, billedDkk: null };
}
