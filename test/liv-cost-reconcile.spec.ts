import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const memory = vi.hoisted(() => ({ rows: new Map<string, any>(), available: true, tail: Promise.resolve() as Promise<unknown>,
  writes: vi.fn(), auth: vi.fn(), provider: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: memory.auth }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: memory.provider }));
vi.mock('@/lib/firebase-admin', () => {
  const collection = (path: string): any => ({ doc: (id: string) => ({ path: `${path}/${id}`, collection: (name: string) => collection(`${path}/${id}/${name}`) }),
    where: (field: string, _op: string, value: unknown) => ({ limit: (limit: number) => ({ path, field, value, limit }) }) });
  return { getAdminDb: () => memory.available ? { collection, runTransaction: (fn: any) => {
    const task = memory.tail.catch(() => {}).then(async () => {
      const writes: Array<() => void> = [];
      const snapshot = (ref: any) => ({ id: ref.path.split('/').at(-1), data: () => structuredClone(memory.rows.get(ref.path)) });
      const result = await fn({ get: async (ref: any) => {
        if (writes.length) throw new Error('read_after_write');
        if (!ref.field) return snapshot(ref);
        const docs = [...memory.rows].filter(([path, row]) => path.startsWith(`${ref.path}/`) && row[ref.field] === ref.value)
          .slice(0, ref.limit).map(([path]) => snapshot({ path }));
        return { docs, size: docs.length };
      }, getAll: async (...refs: any[]) => { if (writes.length) throw new Error('read_after_write'); return refs.map(snapshot); },
      create: (ref: any, data: any) => { if (memory.rows.has(ref.path)) throw new Error('exists');
        writes.push(() => { memory.rows.set(ref.path, structuredClone(data)); memory.writes(ref.path); }); },
      update: (ref: any, data: any) => { if (!memory.rows.has(ref.path)) throw new Error('missing');
        writes.push(() => { memory.rows.set(ref.path, structuredClone({ ...memory.rows.get(ref.path), ...data })); memory.writes(ref.path); }); },
      });
      writes.forEach(write => write()); return result;
    }); memory.tail = task; return task;
  } } : null };
});
import { inspectLivCostReconciliation, reconcileLivCostLedger } from '@/lib/liv/cost-reconcile';
import { LIV_PRICE_VERSION, LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE } from '@/lib/liv/cost-pricing';
import { POST } from '@/app/api/liv/operations/cost-reconcile/route';

const month = '2026-09', monthPath = `livCostLedger/month-${month}`;
const policy = { monthlyLimitDkkMicros: 300_000_000, usdToDkkCeiling: 8, validUntil: '2026-10-12T00:00:00Z',
  priceVersion: LIV_PRICE_VERSION, conversionBasis: 'Fixture explicit FX allowance' };
const callId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const callPath = (n = 1) => `livCostLedger/call-${callId(n)}`;
const resultPath = (n = 1) => `livCostLedger/result-${callId(n)}`;
function addCall(n: number, inputTokens: number, outputTokens: number, inputTokenBound: number, image = true) {
  const quote = { kind: image ? 'image' : 'text', model: image ? 'gpt-image-1.5' : 'gpt-5.6-luna',
    endpoint: image ? '/images/generations' : '/chat/completions', version: LIV_PRICE_VERSION,
    source: 'https://developers.openai.com/api/docs/pricing', inputTokenBound, outputTokenBound: image ? 0 : 2000,
    toolCallBound: 0, inputUsdPerMillion: image ? 5 : 0.5, outputUsdPerMillion: image ? 32 : 1.8,
    fixedUsdBound: image ? 0.2 : 0, reservedUsdMicros: Math.ceil(inputTokenBound * (image ? 5 : 0.5) + (image ? 200000 : 3600)) };
  const estimate = Math.ceil((inputTokens * quote.inputUsdPerMillion + outputTokens * quote.outputUsdPerMillion)) * 8;
  const reserved = quote.reservedUsdMicros * 8;
  memory.rows.set(callPath(n), { callId: callId(n), month, runId: 'prepare-2026-09-14', stage: 'media', requestHash: 'a'.repeat(64),
    quote, model: quote.model, policy, reservedDkkMicros: reserved, billedCostDkkMicros: null, usage: null,
    status: estimate > reserved ? 'bound_exceeded' : 'usage_recorded', createdAt: '2026-09-12T10:00:00Z' });
  memory.rows.set(resultPath(n), { outcome: { status: 'response', httpStatus: 200, responseModel: quote.model,
    providerRequestId: `req_fixture_${n}`, usage: { inputTokens, outputTokens, cachedInputTokens: 0, reasoningTokens: null, toolCalls: 0 } },
    usageBasedUpperDkkMicros: estimate, billedCostDkkMicros: null, reservationRetained: false, recordedAt: '2026-09-12T10:01:00Z' });
  return estimate;
}
beforeEach(() => {
  vi.resetAllMocks(); memory.rows.clear(); memory.available = true; memory.tail = Promise.resolve();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
  memory.rows.set('livCostLedger/policy', structuredClone(policy));
  const committed = addCall(1, 206, 6590, 2056) + addCall(2, 205, 6544, 2057) + addCall(3, 210, 6630, 2076) + addCall(4, 100, 50, 1500, false);
  memory.rows.set(monthPath, { calls: 4, committedDkkMicros: committed, reservedDkkMicros: 0, unknownCalls: 0, blocked: true,
    trackingStartedAt: '2026-09-12T08:00:00Z', updatedAt: '2026-09-12T10:01:00Z' });
  memory.rows.set('livDailyArticles/prepare-2026-09-14', { paid: 'untouched' });
});
afterEach(() => { expect(memory.provider).not.toHaveBeenCalled(); vi.useRealTimers(); });
const request = (body: unknown, query = '') => new NextRequest(`https://app.example/api/liv/operations/cost-reconcile${query}`, {
  method: 'POST', body: JSON.stringify(body) });
const input = async () => ({ action: 'reconcile', month, requestId: 'image-allowance-20260912',
  expectedLedgerHash: (await inspectLivCostReconciliation(month)).ledgerHash, reason: 'Reconcile legacy image output allowance against saved receipts' });

it('inspects without writes, then preserves all calls/results and totals while atomically auditing corrected per-call holds', async () => {
  const before = structuredClone([...memory.rows]);
  const response = await POST(request({ action: 'inspect', month }));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ status: 'reconcilable', calls: 4, correctedImageCalls: 3,
    imageOutputTokenAllowance: LIV_IMAGE_OUTPUT_TOKEN_ALLOWANCE });
  expect(memory.writes).not.toHaveBeenCalled();
  const edit = await input();
  expect(await (await POST(request(edit))).json()).toMatchObject({ status: 'reconciled', correctedImageCalls: 3 });
  for (const [path, row] of before) expect(memory.rows.get(path)).toEqual(path === monthPath ? { ...row, blocked: false } : row);
  const audit = memory.rows.get(`livCostReconciliations/${month}/requests/${edit.requestId}`);
  expect(audit).toMatchObject({ input: edit, previousMonth: Object.fromEntries(before)[monthPath],
    authority: 'cron-authenticated-operator', correction: { outputTokenAllowance: 8192 } });
  expect(audit.evidence).toHaveLength(4);
  expect(audit.evidence[0]).toMatchObject({ originalReservedDkkMicros: 1682240, usageBasedUpperDkkMicros: 1695280,
    correctedReservedDkkMicros: (2056 * 5 + 8192 * 32) * 8 });
  expect(memory.writes).toHaveBeenCalledTimes(2);
});

it('is idempotent even after later ledger changes and never re-clears a new block', async () => {
  const edit = await input();
  expect((await reconcileLivCostLedger(edit)).status).toBe('reconciled');
  memory.rows.get(monthPath).blocked = true; memory.rows.get(monthPath).calls++;
  memory.writes.mockClear(); const before = structuredClone([...memory.rows]);
  expect((await reconcileLivCostLedger(edit)).status).toBe('already_reconciled');
  await expect(reconcileLivCostLedger({ ...edit, reason: 'Changed reason' })).rejects.toThrow('conflict');
  expect(memory.writes).not.toHaveBeenCalled(); expect([...memory.rows]).toEqual(before);
});
it('serializes concurrent reconciliation requests and refuses a second independent unblocking', async () => {
  const edit = await input();
  const results = await Promise.all([reconcileLivCostLedger(edit), reconcileLivCostLedger(edit)]);
  expect(results.map(result => result.status)).toEqual(['reconciled', 'already_reconciled']);
  await expect(reconcileLivCostLedger({ ...edit, requestId: 'different-request' })).rejects.toThrow('conflict');
  expect(memory.writes).toHaveBeenCalledTimes(2);
});
it.each(['month', 'call', 'receipt', 'policy'])('rejects a changed %s snapshot after inspect with no writes', async kind => {
  const edit = await input();
  const path = kind === 'month' ? monthPath : kind === 'call' ? callPath() : kind === 'receipt' ? resultPath() : 'livCostLedger/policy';
  memory.rows.get(path).auditChange = true;
  await expect(reconcileLivCostLedger(edit)).rejects.toThrow('conflict'); expect(memory.writes).not.toHaveBeenCalled();
});
it.each(['missing-receipt', 'missing-call', 'extra-call', 'unknown', 'reserved', 'bad-total', 'bad-count', 'not-blocked',
  'ambiguous', 'http', 'model', 'missing-usage', 'bad-usage', 'bad-estimate', 'retained', 'billed', 'wrong-status',
  'new-quote', 'wrong-fixed', 'wrong-rate', 'wrong-reservation', 'too-large', 'text-breach', 'policy-missing', 'over-cap'])('fails closed on %s', async kind => {
  const call = memory.rows.get(callPath()), receipt = memory.rows.get(resultPath()), totals = memory.rows.get(monthPath);
  if (kind === 'missing-receipt') memory.rows.delete(resultPath());
  if (kind === 'missing-call') memory.rows.delete(callPath());
  if (kind === 'extra-call') addCall(5, 100, 50, 1500, false);
  if (kind === 'unknown') totals.unknownCalls = 1;
  if (kind === 'reserved') totals.reservedDkkMicros = 1;
  if (kind === 'bad-total') totals.committedDkkMicros++;
  if (kind === 'bad-count') totals.calls = '4';
  if (kind === 'not-blocked') totals.blocked = false;
  if (kind === 'ambiguous') receipt.outcome.status = 'ambiguous';
  if (kind === 'http') receipt.outcome.httpStatus = 500;
  if (kind === 'model') receipt.outcome.responseModel = 'gpt-unpriced';
  if (kind === 'missing-usage') receipt.outcome.usage = null;
  if (kind === 'bad-usage') receipt.outcome.usage.outputTokens = -1;
  if (kind === 'bad-estimate') receipt.usageBasedUpperDkkMicros++;
  if (kind === 'retained') receipt.reservationRetained = true;
  if (kind === 'billed') receipt.billedCostDkkMicros = 0;
  if (kind === 'wrong-status') call.status = 'usage_recorded';
  if (kind === 'new-quote') call.quote.outputTokenBound = 8192;
  if (kind === 'wrong-fixed') call.quote.fixedUsdBound = 0.19;
  if (kind === 'wrong-rate') call.quote.outputUsdPerMillion = 30;
  if (kind === 'wrong-reservation') call.reservedDkkMicros++;
  if (kind === 'too-large' || kind === 'text-breach') {
    const old = receipt.usageBasedUpperDkkMicros;
    const replacement = kind === 'too-large' ? addCall(1, 206, 9000, 2056) : addCall(1, 500000, 50, 1500, false);
    totals.committedDkkMicros += replacement - old;
  }
  if (kind === 'policy-missing') memory.rows.delete('livCostLedger/policy');
  if (kind === 'over-cap') memory.rows.get('livCostLedger/policy').monthlyLimitDkkMicros = 1;
  const before = structuredClone([...memory.rows]);
  await expect(inspectLivCostReconciliation(month)).rejects.toThrow('conflict');
  expect([...memory.rows]).toEqual(before); expect(memory.writes).not.toHaveBeenCalled();
});
it.each([null, {}, { action: 'inspect', month: '2026-00' }, { action: 'inspect', month: '2026-08' },
  { action: 'inspect', month: '2026-10' }, { action: 'inspect', month, blocked: false },
  { action: 'reset', month }, { action: 'reconcile', month, requestId: '../other' }])('rejects malformed/out-of-month input %j', async body => {
  expect((await POST(request(body))).status).toBe(400); expect(memory.writes).not.toHaveBeenCalled();
});
it('authenticates before reads and sanitizes unavailable/error responses', async () => {
  memory.auth.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  expect((await POST(request({ action: 'inspect', month }))).status).toBe(403);
  memory.auth.mockReturnValue(null); memory.available = false;
  expect(await (await POST(request({ action: 'inspect', month }))).json()).toEqual({ error: 'liv_cost_reconcile_unavailable' });
  memory.available = true;
  expect((await POST(request({ action: 'inspect', month }, '?force=1'))).status).toBe(400);
  for (const body of ['{', 'x'.repeat(2001)]) expect((await POST(new NextRequest('https://app.example/api/liv/operations/cost-reconcile', { method: 'POST', body }))).status).toBe(400);
  expect(memory.writes).not.toHaveBeenCalled();
});
