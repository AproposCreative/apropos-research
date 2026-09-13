import { getAdminDb } from '@/lib/firebase-admin';
import { copenhagenClock } from './delivery-policy';
import { LIV_PRICE_VALID_UNTIL, LIV_PRICE_VERSION, usageUsdUpperBound, type LivPriceQuote, type LivProviderUsage } from './cost-pricing';
import { sharedCostEnabled, type LivCostContext } from './cost-context';
import { livModels } from './model-config';
import { LivCostPretransportError } from './cost-errors';

export const LIV_COST_COLLECTION = 'livCostLedger';
export const LIV_COST_MAX_CALLS_PER_RUN = 40;
export const LIV_COST_MAX_CALLS_PER_MONTH = 1000;
export type LivBudgetPolicy = {
  monthlyLimitDkkMicros: number; usdToDkkCeiling: number;
  /** Legacy field name: pricing/FX review reminder, not an authorization expiry. */
  validUntil: string;
  /** FX/billing-margin ceiling is an explicit operator assumption, not a live exchange-rate quote. */
  conversionBasis: string; priceVersion: string;
};
export type LivCostReservation = {
  scope?: 'liv' | 'writer' | 'seo' | 'accreditation';
  callId: string; month: string; runId: string; stage: string; requestHash: string;
  model: string; quote: LivPriceQuote; reservedDkkMicros: number; policy: LivBudgetPolicy; createdAt: string;
};
export type LivCostOutcome = {
  status: 'response' | 'ambiguous'; usage: LivProviderUsage | null; providerRequestId: string | null;
  responseModel: string | null; httpStatus: number | null;
};
export interface LivCostLedger {
  reserve(input: { callId: string; context: LivCostContext; quote: LivPriceQuote; requestHash: string }): Promise<LivCostReservation>;
  complete(reservation: LivCostReservation, outcome: LivCostOutcome): Promise<void>;
}
function db() {
  const database = getAdminDb();
  if (!database) throw new Error('liv_cost_store_unavailable');
  return database;
}
function policyOf(value: unknown): LivBudgetPolicy {
  const p = value as LivBudgetPolicy | undefined;
  if (!p || !Number.isSafeInteger(p.monthlyLimitDkkMicros) || p.monthlyLimitDkkMicros <= 0 || p.monthlyLimitDkkMicros > 300_000_000 ||
    !Number.isFinite(p.usdToDkkCeiling) || p.usdToDkkCeiling < 1 || p.usdToDkkCeiling > 100 ||
    typeof p.conversionBasis !== 'string' || p.conversionBasis.trim().length < 10 || p.conversionBasis.length > 500 ||
    p.priceVersion !== LIV_PRICE_VERSION || typeof p.validUntil !== 'string' || !Number.isFinite(Date.parse(p.validUntil))) {
    throw new LivCostPretransportError('liv_cost_policy_missing_or_expired');
  }
  return { monthlyLimitDkkMicros: p.monthlyLimitDkkMicros, usdToDkkCeiling: p.usdToDkkCeiling,
    validUntil: p.validUntil, conversionBasis: p.conversionBasis, priceVersion: p.priceVersion };
}
export { policyOf as validateLivCostPolicy };
const safeCount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;

/** Merge these fields into the EXISTING policy via a privileged Admin SDK
 * operation after reviewing the unchanged price/FX assumptions. Never reset
 * monthly totals or copy old Liv costs into a second ledger.
 */
function sharedPolicyReady(value: Record<string, unknown> | undefined, now: Date): boolean {
  return value?.sharedScopesEnabled === true && typeof value.sharedTrackingStartedAt === 'string' &&
    Number.isFinite(Date.parse(value.sharedTrackingStartedAt)) && Date.parse(value.sharedTrackingStartedAt) <= now.getTime();
}

export function createLivCostLedger(now: () => Date = () => new Date()): LivCostLedger {
  return {
    async reserve({ callId, context, quote, requestHash }) {
      if (!/^[a-f0-9-]{36}$/i.test(callId) || !/^[a-f0-9]{64}$/.test(requestHash) ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(context.runId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(context.stage) ||
        !Number.isSafeInteger(quote.reservedUsdMicros) || quote.reservedUsdMicros <= 0 || quote.version !== LIV_PRICE_VERSION) {
        throw new LivCostPretransportError('liv_cost_reservation_invalid');
      }
      const database = db(), collection = database.collection(LIV_COST_COLLECTION);
      const date = now(), month = copenhagenClock(date).day.slice(0, 7);
      const monthRef = collection.doc(`month-${month}`), callRef = collection.doc(`call-${callId}`);
      const runRef = collection.doc(`run-${month}-${context.runId}`);
      return database.runTransaction(async tx => {
        const policyRow = (await tx.get(collection.doc('policy'))).data();
        const policy = policyOf(policyRow);
        if (context.scope !== undefined && (!['writer', 'seo', 'accreditation'].includes(context.scope) || !sharedPolicyReady(policyRow, date))) {
          throw new LivCostPretransportError('liv_cost_shared_policy_unconfigured');
        }
        const existing = (await tx.get(callRef)).data();
        const totals = (await tx.get(monthRef)).data() || { committedDkkMicros: 0, reservedDkkMicros: 0, calls: 0, unknownCalls: 0 };
        const run = (await tx.get(runRef)).data() || { calls: 0 };
        if (existing) throw new Error('liv_cost_call_already_reserved');
        if (![totals.committedDkkMicros, totals.reservedDkkMicros, totals.calls, totals.unknownCalls].every(safeCount) || totals.blocked) {
          throw new Error('liv_cost_ledger_requires_reconciliation');
        }
        if (!safeCount(run.calls) || run.calls >= LIV_COST_MAX_CALLS_PER_RUN || totals.calls >= LIV_COST_MAX_CALLS_PER_MONTH) {
          throw new LivCostPretransportError('liv_cost_call_limit_exceeded');
        }
        const amount = Math.ceil(quote.reservedUsdMicros * policy.usdToDkkCeiling);
        if (!Number.isSafeInteger(amount) || amount + totals.committedDkkMicros + totals.reservedDkkMicros > policy.monthlyLimitDkkMicros) {
          throw new LivCostPretransportError('liv_cost_monthly_budget_exceeded');
        }
        const reservation: LivCostReservation = { callId, month, runId: context.runId, stage: context.stage, requestHash,
          model: quote.model, quote, reservedDkkMicros: amount, policy, createdAt: date.toISOString() };
        tx.create(callRef, { ...reservation, scope: context.scope ?? 'liv', status: 'reserved', usage: null, billedCostDkkMicros: null });
        tx.set(runRef, { calls: run.calls + 1, updatedAt: date.toISOString() });
        tx.set(monthRef, { ...totals, reservedDkkMicros: totals.reservedDkkMicros + amount, calls: totals.calls + 1,
          unknownCalls: totals.unknownCalls + 1, trackingStartedAt: totals.trackingStartedAt || date.toISOString(), updatedAt: date.toISOString() });
        return reservation;
      });
    },
    async complete(reservation, outcome) {
      const database = db(), collection = database.collection(LIV_COST_COLLECTION);
      const callRef = collection.doc(`call-${reservation.callId}`), monthRef = collection.doc(`month-${reservation.month}`);
      await database.runTransaction(async tx => {
        const call = (await tx.get(callRef)).data();
        const totals = (await tx.get(monthRef)).data();
        const receiptRef = collection.doc(`result-${reservation.callId}`);
        const oldReceipt = (await tx.get(receiptRef)).data();
        if (!call || call.requestHash !== reservation.requestHash || call.reservedDkkMicros !== reservation.reservedDkkMicros || !totals ||
          ![totals.committedDkkMicros, totals.reservedDkkMicros, totals.unknownCalls].every(safeCount)) throw new Error('liv_cost_ledger_requires_reconciliation');
        if (oldReceipt) {
          if (JSON.stringify(oldReceipt.outcome) !== JSON.stringify(outcome)) throw new Error('liv_cost_receipt_conflict');
          return;
        }
        const modelMatches = !outcome.responseModel || outcome.responseModel === reservation.model ||
          new RegExp(`^${reservation.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{4}-\\d{2}-\\d{2}$`).test(outcome.responseModel);
        const usd = modelMatches && outcome.status === 'response' && outcome.httpStatus === 200 && outcome.usage
          ? usageUsdUpperBound(reservation.quote, outcome.usage) : null;
        const estimate = usd === null ? null : Math.ceil(usd * reservation.policy.usdToDkkCeiling);
        const breached = estimate !== null && estimate > reservation.reservedDkkMicros;
        // An ambiguous/missing usage result is NOT free. Its full reservation remains.
        tx.create(receiptRef, { outcome, usageBasedUpperDkkMicros: estimate, billedCostDkkMicros: null,
          reservationRetained: estimate === null, recordedAt: now().toISOString() });
        tx.set(callRef, { status: breached ? 'bound_exceeded' : estimate === null ? 'unreconciled' : 'usage_recorded' }, { merge: true });
        if (!modelMatches) tx.set(monthRef, { ...totals, blocked: true });
        if (estimate !== null) {
          if (totals.reservedDkkMicros < reservation.reservedDkkMicros || totals.unknownCalls < 1) throw new Error('liv_cost_ledger_requires_reconciliation');
          tx.set(monthRef, { ...totals, reservedDkkMicros: totals.reservedDkkMicros - reservation.reservedDkkMicros,
            committedDkkMicros: totals.committedDkkMicros + estimate, unknownCalls: totals.unknownCalls - 1,
            ...(breached ? { blocked: true } : {}), updatedAt: now().toISOString() });
        }
      });
    },
  };
}

export type LivCostSummary = {
  month: string; currency: 'DKK'; monthlyLimitDkk: number;
  trackedCalls: number | null; unknownCalls: number | null;
  usageBasedUpperDkk: number | null; reservedUpperDkk: number | null; availableAllowanceDkk: number | null;
  billedDkk: null; trackingStartedAt: string | null;
  status: 'ready_partial' | 'unconfigured' | 'blocked' | 'unavailable';
  pricingStatus: 'verified' | 'review_due' | 'missing_or_expired'; priceVersion: string;
  /** Legacy name: review reminder only; stale assumptions remain estimates, not verified current prices. */
  priceValidUntil: string;
  coverage: 'liv_openai_context_only' | 'shared_server_cost_contexts'; historicalCostsIncluded: false; fullMonthlyCapVerified: false;
  maxCallsPerRun: number; maxCallsPerMonth: number;
};
/** Read-only; estimates apply only to tracked calls, never historical account billing. */
export async function readLivCostSummary(now = new Date()): Promise<LivCostSummary> {
  const month = copenhagenClock(now).day.slice(0, 7);
  const knownModels = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
  let known = false;
  try { known = Object.values(livModels()).every(model => knownModels.includes(model)) &&
    (process.env.LIV_IMAGE_MODEL?.trim() || 'gpt-image-1.5') === 'gpt-image-1.5'; } catch { /* Unpriced config. */ }
  const result: LivCostSummary = { month, currency: 'DKK', monthlyLimitDkk: 300,
    trackedCalls: null, unknownCalls: null, usageBasedUpperDkk: null, reservedUpperDkk: null, availableAllowanceDkk: null,
    billedDkk: null, trackingStartedAt: null, status: 'unconfigured',
    pricingStatus: !known ? 'missing_or_expired' : now.getTime() < Date.parse(LIV_PRICE_VALID_UNTIL) ? 'verified' : 'review_due',
    priceVersion: LIV_PRICE_VERSION, priceValidUntil: LIV_PRICE_VALID_UNTIL,
    coverage: 'liv_openai_context_only', historicalCostsIncluded: false, fullMonthlyCapVerified: false,
    maxCallsPerRun: LIV_COST_MAX_CALLS_PER_RUN, maxCallsPerMonth: LIV_COST_MAX_CALLS_PER_MONTH };
  try {
    const collection = db().collection(LIV_COST_COLLECTION);
    const [policyRow, monthRow] = await Promise.all([collection.doc('policy').get(), collection.doc(`month-${month}`).get()]);
    let policy: LivBudgetPolicy | null = null;
    try { policy = policyOf(policyRow.data()); } catch { /* No fabricated zero-cost policy. */ }
    if (policy) { result.monthlyLimitDkk = policy.monthlyLimitDkkMicros / 1_000_000; result.status = 'ready_partial'; }
    if (policyRow.data()?.sharedTrackingStartedAt) result.coverage = 'shared_server_cost_contexts';
    if (policy && result.pricingStatus === 'verified' && now.getTime() >= Date.parse(policy.validUntil)) result.pricingStatus = 'review_due';
    if (result.pricingStatus === 'missing_or_expired') result.status = 'blocked';
    const totals = monthRow.data();
    if (totals) {
      if (![totals.calls, totals.unknownCalls, totals.committedDkkMicros, totals.reservedDkkMicros].every(safeCount)) {
        result.status = 'blocked'; return result;
      }
      result.trackedCalls = totals.calls; result.unknownCalls = totals.unknownCalls;
      result.usageBasedUpperDkk = totals.committedDkkMicros / 1_000_000;
      result.reservedUpperDkk = totals.reservedDkkMicros / 1_000_000;
      result.trackingStartedAt = typeof totals.trackingStartedAt === 'string' ? totals.trackingStartedAt : null;
      if (policy && result.status === 'ready_partial') result.availableAllowanceDkk = Math.max(0,
        policy.monthlyLimitDkkMicros - totals.committedDkkMicros - totals.reservedDkkMicros) / 1_000_000;
      if (totals.blocked || totals.calls >= LIV_COST_MAX_CALLS_PER_MONTH) {
        result.status = 'blocked'; result.availableAllowanceDkk = null;
      }
    }
    return result;
  } catch { return { ...result, status: 'unavailable' }; }
}

export type SharedCostSummary = Omit<LivCostSummary, 'coverage'> & {
  coverage: 'shared_server_cost_contexts';
  sharedActivation: 'disabled' | 'policy_required' | 'enabled' | 'invalid_flag' | 'unavailable';
  sharedTrackingStartedAt: string | null;
  includedScopes: Array<'liv' | 'writer' | 'seo' | 'accreditation'>;
  excludedScopes: string[];
  unpricedBehavior: 'deny_before_transport';
  unknownUsageBehavior: 'retain_full_reservation';
  existingLivCostsIncluded: true;
};

/** App estimates only. Activation describes configuration, not proof that every
 * boundary was deployed or that historical Writer/SEO spend was captured.
 */
export async function readSharedCostSummary(now = new Date()): Promise<SharedCostSummary> {
  const base = await readLivCostSummary(now);
  const result: SharedCostSummary = { ...base, coverage: 'shared_server_cost_contexts',
    sharedActivation: 'disabled', sharedTrackingStartedAt: null, includedScopes: ['liv'],
    excludedScopes: ['unscoped_openai_calls', 'accreditation_other_calls', 'podcast', 'other_providers', 'historical_untracked_calls'],
    unpricedBehavior: 'deny_before_transport', unknownUsageBehavior: 'retain_full_reservation', existingLivCostsIncluded: true };
  let enabled: boolean;
  try { enabled = sharedCostEnabled(); }
  catch { return { ...result, sharedActivation: 'invalid_flag' }; }
  try {
    const policy = (await db().collection(LIV_COST_COLLECTION).doc('policy').get()).data();
    if (sharedPolicyReady(policy, now)) {
      result.sharedTrackingStartedAt = policy!.sharedTrackingStartedAt as string;
      // Coverage remains partial and includes previously tracked scopes after rollback.
      result.includedScopes = ['liv', 'writer', 'seo', 'accreditation'];
    }
    if (enabled) {
      result.sharedActivation = 'policy_required';
      try { policyOf(policy); if (sharedPolicyReady(policy, now)) result.sharedActivation = 'enabled'; } catch { /* Fail closed. */ }
    }
  } catch { result.sharedActivation = 'unavailable'; }
  return result;
}
