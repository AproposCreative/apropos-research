import { z } from 'zod';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { copenhagenClock } from './delivery-policy';
import { LIV_COST_COLLECTION, LIV_COST_MAX_CALLS_PER_MONTH, type LivCostOutcome, type LivCostReservation } from './cost-ledger';
import { LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE, LIV_PRICE_VERSION, usageUsdUpperBound } from './cost-pricing';

const monthSchema = z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const requestSchema = z.object({
  action: z.literal('reconcile'), month: monthSchema,
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/), expectedLedgerHash: sha,
  reason: z.string().trim().min(3).max(500).refine(value => !/[<>\x00-\x1f]/.test(value)),
}).strict();
export const costReconcileInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inspect'), month: monthSchema }).strict(), requestSchema,
]);
type Row = Record<string, unknown>;
function conflict(): never { throw new Error('liv_cost_reconcile_conflict'); }
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const rowOf = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : conflict();
function database() {
  const db = getAdminDb();
  if (!db) throw new Error('liv_cost_reconcile_unavailable');
  return db;
}
function validPolicy(value: unknown) {
  const policy = rowOf(value);
  if (!count(policy.monthlyLimitDkkMicros) || policy.monthlyLimitDkkMicros < 1 || policy.monthlyLimitDkkMicros > 300_000_000 ||
    typeof policy.usdToDkkCeiling !== 'number' || !Number.isFinite(policy.usdToDkkCeiling) ||
    policy.usdToDkkCeiling < 1 || policy.usdToDkkCeiling > 100 || policy.priceVersion !== LIV_PRICE_VERSION ||
    typeof policy.validUntil !== 'string' || !Number.isFinite(Date.parse(policy.validUntil)) ||
    typeof policy.conversionBasis !== 'string' || policy.conversionBasis.trim().length < 10 || policy.conversionBasis.length > 500) conflict();
  return policy;
}

/** Reconcile only proved legacy image allowance breaches. Never release unknown
 * reservations, reprice usage, change a receipt, or forgive another block cause. */
async function inspect(tx: Transaction, db: Firestore, month: string) {
  const collection = db.collection(LIV_COST_COLLECTION), monthRef = collection.doc(`month-${month}`);
  const totals = rowOf((await tx.get(monthRef)).data());
  const policy = validPolicy((await tx.get(collection.doc('policy'))).data());
  if (totals.blocked !== true || !count(totals.calls) || totals.calls < 1 || totals.calls > LIV_COST_MAX_CALLS_PER_MONTH ||
    !count(totals.committedDkkMicros) || totals.reservedDkkMicros !== 0 || totals.unknownCalls !== 0) conflict();
  const calls = await tx.get(collection.where('month', '==', month).limit(LIV_COST_MAX_CALLS_PER_MONTH + 1));
  if (calls.size !== totals.calls) conflict();
  const docs = [...calls.docs].sort((a, b) => a.id.localeCompare(b.id));
  const receipts = await tx.getAll(...docs.map(doc => collection.doc(`result-${doc.id.slice(5)}`)));
  let committed = 0;
  const evidence: Array<{ callId: string; callHash: string; receiptHash: string;
    originalReservedDkkMicros: number; usageBasedUpperDkkMicros: number; correctedReservedDkkMicros?: number }> = [];
  for (let index = 0; index < docs.length; index++) {
    const call = rowOf(docs[index].data()), receipt = rowOf(receipts[index].data());
    if (typeof call.callId !== 'string' || !/^[a-f0-9-]{36}$/i.test(call.callId) || docs[index].id !== `call-${call.callId}` ||
      call.month !== month || !sha.safeParse(call.requestHash).success ||
      typeof call.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(call.runId) ||
      typeof call.stage !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(call.stage) ||
      !['usage_recorded', 'bound_exceeded'].includes(String(call.status)) ||
      !count(call.reservedDkkMicros) || call.reservedDkkMicros < 1 || call.billedCostDkkMicros !== null || call.usage !== null) conflict();
    const quote = rowOf(call.quote), originalPolicy = validPolicy(call.policy);
    if (quote.model !== call.model || typeof call.model !== 'string' || !/^gpt-[a-z0-9.-]+$|^text-embedding-3-small$/.test(call.model) ||
      quote.version !== LIV_PRICE_VERSION || !count(quote.reservedUsdMicros) || quote.reservedUsdMicros < 1 ||
      !count(quote.inputTokenBound) || !count(quote.outputTokenBound) || !count(quote.toolCallBound) ||
      !['text', 'image', 'embedding'].includes(String(quote.kind)) ||
      typeof quote.inputUsdPerMillion !== 'number' || !Number.isFinite(quote.inputUsdPerMillion) || quote.inputUsdPerMillion <= 0 ||
      typeof quote.outputUsdPerMillion !== 'number' || !Number.isFinite(quote.outputUsdPerMillion) || quote.outputUsdPerMillion < 0 ||
      Math.ceil(quote.reservedUsdMicros * Number(originalPolicy.usdToDkkCeiling)) !== call.reservedDkkMicros) conflict();
    const outcome = rowOf(receipt.outcome), usage = rowOf(outcome.usage);
    if (outcome.status !== 'response' || outcome.httpStatus !== 200 ||
      (outcome.responseModel !== null && (typeof outcome.responseModel !== 'string' ||
        (outcome.responseModel !== call.model && !(outcome.responseModel.startsWith(`${call.model}-`) &&
          /^\d{4}-\d{2}-\d{2}$/.test(outcome.responseModel.slice(call.model.length + 1)))))) ||
      !count(usage.inputTokens) || usage.inputTokens < 1 || !count(usage.outputTokens) ||
      !['cachedInputTokens', 'reasoningTokens', 'toolCalls'].every(key => usage[key] === null || count(usage[key])) ||
      receipt.reservationRetained !== false || receipt.billedCostDkkMicros !== null) conflict();
    const usd = usageUsdUpperBound(quote as LivCostReservation['quote'], usage as unknown as NonNullable<LivCostOutcome['usage']>);
    const estimate = usd === null ? null : Math.ceil(usd * Number(originalPolicy.usdToDkkCeiling));
    if (!count(estimate) || receipt.usageBasedUpperDkkMicros !== estimate) conflict();
    const breached = estimate > call.reservedDkkMicros;
    if ((call.status === 'bound_exceeded') !== breached) conflict();
    let correctedReservedDkkMicros: number | undefined;
    if (breached) {
      if (quote.kind !== 'image' || quote.model !== 'gpt-image-1.5' || quote.endpoint !== '/images/generations' ||
        quote.fixedUsdBound !== 0.20 || quote.outputTokenBound !== 0 || quote.toolCallBound !== 0 ||
        quote.inputUsdPerMillion !== 5 || quote.outputUsdPerMillion !== 32 || quote.inputTokenBound < 1 ||
        quote.reservedUsdMicros !== Math.ceil(quote.inputTokenBound * 5 + 200_000) ||
        usage.inputTokens > quote.inputTokenBound || usage.outputTokens > LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE) conflict();
      correctedReservedDkkMicros = Math.ceil(Math.ceil(quote.inputTokenBound * 5 + LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE * 32) * Number(originalPolicy.usdToDkkCeiling));
      if (!count(correctedReservedDkkMicros) || estimate > correctedReservedDkkMicros) conflict();
    }
    committed += estimate;
    if (!count(committed)) conflict();
    evidence.push({ callId: call.callId, callHash: cmsFieldHash(call), receiptHash: cmsFieldHash(receipt),
      originalReservedDkkMicros: call.reservedDkkMicros, usageBasedUpperDkkMicros: estimate,
      ...(correctedReservedDkkMicros === undefined ? {} : { correctedReservedDkkMicros }) });
  }
  const correctedCalls = evidence.filter(call => call.correctedReservedDkkMicros !== undefined);
  if (!correctedCalls.length || committed !== totals.committedDkkMicros || committed > Number(policy.monthlyLimitDkkMicros)) conflict();
  const ledgerHash = cmsFieldHash({ month, totals, policy, evidence, imageOutputTokenAllowance: LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE });
  return { monthRef, totals, policy, evidence, ledgerHash, correctedCalls,
    summary: { month, ledgerHash, calls: totals.calls, committedDkkMicros: committed,
      reservedDkkMicros: 0, unknownCalls: 0, correctedImageCalls: correctedCalls.length,
      imageOutputTokenAllowance: LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE } };
}

export async function inspectLivCostReconciliation(month: string) {
  if (!monthSchema.safeParse(month).success || month !== copenhagenClock().day.slice(0, 7)) throw new Error('liv_cost_reconcile_invalid');
  const db = database();
  return db.runTransaction(async tx => ({ status: 'reconcilable' as const, ...(await inspect(tx, db, month)).summary }));
}

export async function reconcileLivCostLedger(value: unknown) {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success || parsed.data.month !== copenhagenClock().day.slice(0, 7)) throw new Error('liv_cost_reconcile_invalid');
  const input = parsed.data, inputHash = cmsFieldHash(input), db = database();
  const audit = db.collection('livCostReconciliations').doc(input.month).collection('requests').doc(input.requestId);
  return db.runTransaction(async tx => {
    const prior = (await tx.get(audit)).data();
    if (prior) {
      if (prior.inputHash !== inputHash) conflict();
      return { ...prior.summary, status: 'already_reconciled' as const };
    }
    const snapshot = await inspect(tx, db, input.month);
    if (snapshot.ledgerHash !== input.expectedLedgerHash) conflict();
    const nextMonth = { ...snapshot.totals, blocked: false };
    tx.create(audit, { input, inputHash, previousMonth: snapshot.totals, nextMonth,
      policy: snapshot.policy, evidence: snapshot.evidence, summary: snapshot.summary,
      correction: { kind: 'legacy-image-output-allowance', priceVersion: LIV_PRICE_VERSION,
        outputTokenAllowance: LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE },
      authority: 'cron-authenticated-operator', recordedAt: new Date().toISOString() });
    tx.update(snapshot.monthRef, { blocked: false });
    return { status: 'reconciled' as const, ...snapshot.summary };
  });
}
