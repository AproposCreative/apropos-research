import { getAdminDb } from '@/lib/firebase-admin';
import { costTotals } from '@/lib/ai/cost-totals';
import { createLivCostLedger, validateLivCostPolicy } from '@/lib/liv/cost-ledger';
import { copenhagenClock } from '@/lib/liv/delivery-policy';

export const IMAGE_GEN_MONTHLY_LIMIT_DKK = 150;
export const IMAGE_GEN_LEDGER = 'imageGenCostLedger';
export const createImageGenCostLedger = (now?: () => Date) => createLivCostLedger(now, 'image-gen');

/** Aggregate only; never returns another editor's requests or prompts. No bootstrap on GET. */
export async function readImageGenBudget(now = new Date()) {
  const db = getAdminDb();
  if (!db) throw new Error('image_gen_budget_unavailable');
  const month = copenhagenClock(now).day.slice(0, 7);
  const collection = db.collection(IMAGE_GEN_LEDGER);
  const [policyRow, totalRow] = await Promise.all([collection.doc('policy').get(), collection.doc(`month-${month}`).get()]);
  let policy;
  try { policy = validateLivCostPolicy(policyRow.data()); } catch { return { status: 'unconfigured', month, monthlyLimitDkk: 150 }; }
  if (policy.monthlyLimitDkkMicros > 150_000_000) throw new Error('image_gen_budget_invalid');
  const totals = totalRow.data() ?? { committedDkkMicros: 0, reservedDkkMicros: 0, calls: 0 };
  let projected;
  try { projected = costTotals(totals); } catch { throw new Error('image_gen_budget_invalid'); }
  return { status: totals.blocked ? 'blocked' : 'ready', month,
    monthlyLimitDkk: policy.monthlyLimitDkkMicros / 1e6,
    estimatedDkk: projected.estimatedDkk, reservedDkk: projected.reservedDkk,
    remainingDkk: Math.max(0, policy.monthlyLimitDkkMicros - totals.committedDkkMicros - totals.reservedDkkMicros) / 1e6,
    trackedCalls: projected.trackedCalls, billedDkk: null, coverage: 'image-gen-only' };
}
