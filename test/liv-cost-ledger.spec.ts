import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const memory = vi.hoisted(() => ({ rows: new Map<string, any>(), available: true, tail: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => memory.available ? {
  collection: (name: string) => ({ doc: (id: string) => ({ key: `${name}/${id}`,
    get: async () => ({ data: () => structuredClone(memory.rows.get(`${name}/${id}`)) }) }) }),
  runTransaction: (run: any) => {
    const result = memory.tail.then(async () => {
      const writes: Array<() => void> = [];
      const value = await run({
        get: async (ref: any) => { if (writes.length) throw new Error('read_after_write'); return { data: () => structuredClone(memory.rows.get(ref.key)) }; },
        create: (ref: any, data: any) => {
          if (memory.rows.has(ref.key)) throw new Error('exists');
          writes.push(() => memory.rows.set(ref.key, structuredClone(data)));
        },
        set: (ref: any, data: any, options?: { merge?: boolean }) => writes.push(() => memory.rows.set(ref.key,
          structuredClone(options?.merge ? { ...memory.rows.get(ref.key), ...data } : data))),
      });
      writes.forEach(write => write()); return value;
    });
    memory.tail = result.catch(() => undefined); return result;
  },
} : null }));
import { createLivCostLedger, readLivCostSummary, readSharedCostSummary, LIV_COST_MAX_CALLS_PER_RUN, LIV_COST_MAX_CALLS_PER_MONTH } from '@/lib/liv/cost-ledger';
import { LIV_PRICE_VERSION, quoteLivOpenAIRequest, quoteLivImageRequest } from '@/lib/liv/cost-pricing';
import { getLivCostPretransportError } from '@/lib/liv/cost-errors';
import { activateSharedCostPolicy, inspectSharedCostActivation } from '@/lib/liv/cost-activation';
const now = new Date('2026-09-12T10:00:00Z');
const policy = { monthlyLimitDkkMicros: 300_000_000, usdToDkkCeiling: 8, validUntil: '2026-10-01T00:00:00.000Z',
  conversionBasis: 'TEST fixture ceiling; not a market exchange-rate claim', priceVersion: LIV_PRICE_VERSION };
const quote = quoteLivOpenAIRequest('/chat/completions', { model: 'gpt-5.6-luna', max_completion_tokens: 1000,
  messages: [{ role: 'user', content: 'Test' }] });
const outcome = { status: 'response' as const, usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: null, reasoningTokens: null, toolCalls: 0 },
  providerRequestId: 'req_fixture', responseModel: 'gpt-5.6-luna', httpStatus: 200 };
const call = (n = 1) => ({ callId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, context: { runId: 'prepare-2026-09-13', stage: 'writing' },
  quote, requestHash: 'a'.repeat(64) });
beforeEach(() => { memory.rows.clear(); memory.available = true; memory.tail = Promise.resolve(); memory.rows.set('livCostLedger/policy', structuredClone(policy));
  vi.stubEnv('LIV_GENERATION_MODEL', 'gpt-5.6-sol'); vi.stubEnv('LIV_RESEARCH_MODEL', 'gpt-5.6-sol'); vi.stubEnv('LIV_UTILITY_MODEL', 'gpt-5.6-luna'); vi.stubEnv('LIV_IMAGE_MODEL', 'gpt-image-1.5'); });
afterEach(() => vi.unstubAllEnvs());
it('reserves durably before a provider call with source pricing and no fabricated billed amount', async () => {
  const ledger = createLivCostLedger(() => now), reservation = await ledger.reserve(call());
  const row = memory.rows.get(`livCostLedger/call-${reservation.callId}`);
  expect(row).toMatchObject({ runId: call().context.runId, stage: 'writing', model: quote.model, requestHash: call().requestHash,
    status: 'reserved', billedCostDkkMicros: null, usage: null, policy, quote });
  expect(row.reservedDkkMicros).toBe(Math.ceil(quote.reservedUsdMicros * 8));
  expect(memory.rows.get('livCostLedger/month-2026-09')).toMatchObject({ calls: 1, unknownCalls: 1, committedDkkMicros: 0, reservedDkkMicros: row.reservedDkkMicros });
});
it('serializes simultaneous reservations so two workers cannot overspend the same balance', async () => {
  const ledger = createLivCostLedger(() => now);
  const results = await Promise.allSettled([ledger.reserve({ ...call(1), quote: { ...quote, reservedUsdMicros: 20_000_000 } }),
    ledger.reserve({ ...call(2), quote: { ...quote, reservedUsdMicros: 20_000_000 } })]);
  expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
  const denial = results.find(x => x.status === 'rejected');
  expect(getLivCostPretransportError(denial?.status === 'rejected' ? denial.reason : null)).toMatchObject({ providerAttempted: false, code: 'liv_cost_monthly_budget_exceeded' });
  expect(memory.rows.get('livCostLedger/month-2026-09').reservedDkkMicros).toBe(160_000_000);
});
it('shares one monthly allowance across all four scopes and preserves ambiguous holds', async () => {
  memory.rows.set('livCostLedger/policy', { ...policy, sharedScopesEnabled: true,
    sharedTrackingStartedAt: '2026-09-12T09:00:00Z' });
  const ledger = createLivCostLedger(() => now);
  const scopes = [undefined, 'writer', 'seo', 'accreditation'] as const;
  const requests = scopes.map((scope, i) => ({ ...call(i + 1),
    context: { runId: `independent-${i}`, stage: 'test', ...(scope ? { scope } : {}) },
    quote: { ...quote, reservedUsdMicros: 10_000_000 } }));
  const results = await Promise.allSettled(requests.map(request => ledger.reserve(request)));
  const accepted = results.filter(result => result.status === 'fulfilled');
  expect(accepted).toHaveLength(3); // Three 80 DKK holds; the fourth exceeds 300.
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(memory.rows.get('livCostLedger/month-2026-09')).toMatchObject({
    committedDkkMicros: 0, reservedDkkMicros: 240_000_000, unknownCalls: 3, calls: 3,
  });
  for (const result of accepted) {
    if (result.status === 'fulfilled') await ledger.complete(result.value, {
      ...outcome, status: 'ambiguous', httpStatus: 500, usage: null,
    });
  }
  await expect(ledger.reserve({ ...requests[3], callId: call(5).callId }))
    .rejects.toThrow('liv_cost_monthly_budget_exceeded');
  expect(memory.rows.get('livCostLedger/month-2026-09').reservedDkkMicros).toBe(240_000_000);
});
it('records usage once, releases only unused allowance, and preserves original reservation attribution', async () => {
  const ledger = createLivCostLedger(() => now), reservation = await ledger.reserve(call());
  const original = structuredClone(memory.rows.get(`livCostLedger/call-${reservation.callId}`));
  await ledger.complete(reservation, outcome); await ledger.complete(reservation, outcome);
  const totals = memory.rows.get('livCostLedger/month-2026-09');
  expect(totals).toMatchObject({ calls: 1, unknownCalls: 0, reservedDkkMicros: 0, committedDkkMicros: 1120 });
  expect(memory.rows.get(`livCostLedger/call-${reservation.callId}`)).toEqual({ ...original, status: 'usage_recorded' });
  expect(memory.rows.get(`livCostLedger/result-${reservation.callId}`)).toMatchObject({ outcome, billedCostDkkMicros: null, usageBasedUpperDkkMicros: 1120 });
  await expect(ledger.complete(reservation, { ...outcome, httpStatus: 500 })).rejects.toThrow('receipt_conflict');
});
it.each([[206, 6590], [205, 6544], [210, 6630]])('settles observed image usage %i/%i below its image quote without blocking the next stage', async (inputTokens, outputTokens) => {
  const imageQuote = quoteLivImageRequest('/images/generations', {
    model: 'gpt-image-1.5', prompt: 'Original editorial illustration', size: '1536x1024', quality: 'high', n: 1,
  });
  const ledger = createLivCostLedger(() => now);
  const reservation = await ledger.reserve({ ...call(), quote: imageQuote, context: { ...call().context, stage: 'media' } });
  const original = structuredClone(memory.rows.get(`livCostLedger/call-${reservation.callId}`));
  const imageOutcome = { ...outcome, responseModel: imageQuote.model, usage: { ...outcome.usage, inputTokens, outputTokens } };
  const actualUsageCost = (inputTokens * 5 + outputTokens * 32) * policy.usdToDkkCeiling;
  expect(reservation.reservedDkkMicros).toBe(imageQuote.reservedUsdMicros * policy.usdToDkkCeiling);
  expect(reservation.reservedDkkMicros).toBeGreaterThan(actualUsageCost);
  await ledger.complete(reservation, imageOutcome);
  const receipt = structuredClone(memory.rows.get(`livCostLedger/result-${reservation.callId}`));
  await ledger.complete(reservation, imageOutcome); // Exact replay must not charge twice or rewrite the receipt.
  expect(memory.rows.get(`livCostLedger/result-${reservation.callId}`)).toEqual(receipt);
  expect(receipt).toMatchObject({ outcome: imageOutcome, usageBasedUpperDkkMicros: actualUsageCost,
    reservationRetained: false, billedCostDkkMicros: null });
  expect(memory.rows.get(`livCostLedger/call-${reservation.callId}`)).toEqual({ ...original, status: 'usage_recorded' });
  const totals = memory.rows.get('livCostLedger/month-2026-09');
  expect(totals).toMatchObject({ calls: 1, unknownCalls: 0, reservedDkkMicros: 0, committedDkkMicros: actualUsageCost });
  expect(totals.blocked).not.toBe(true);
  expect(memory.rows.get('livCostLedger/policy')).toEqual(policy);
  await expect(ledger.reserve(call(2))).resolves.toMatchObject({ callId: call(2).callId });
});
it.each([null, { ...outcome.usage, inputTokens: 100 }])('retains the full hold on an ambiguous/error response, even when usage is present: %j', async usage => {
  const ledger = createLivCostLedger(() => now), reservation = await ledger.reserve(call());
  await ledger.complete(reservation, { ...outcome, status: 'ambiguous', httpStatus: 500, usage });
  expect(memory.rows.get('livCostLedger/month-2026-09')).toMatchObject({ unknownCalls: 1, reservedDkkMicros: reservation.reservedDkkMicros, committedDkkMicros: 0 });
  expect(memory.rows.get(`livCostLedger/result-${reservation.callId}`).usageBasedUpperDkkMicros).toBeNull();
  expect(memory.rows.get(`livCostLedger/result-${reservation.callId}`).usageBasedUpperDkkMicros).not.toBe(0);
});
it('holds missing usage instead of claiming a zero/free call', async () => {
  const ledger = createLivCostLedger(() => now), reservation = await ledger.reserve(call());
  await ledger.complete(reservation, { ...outcome, usage: null });
  expect(memory.rows.get(`livCostLedger/result-${reservation.callId}`).usageBasedUpperDkkMicros).toBeNull();
  expect(memory.rows.get(`livCostLedger/result-${reservation.callId}`).reservationRetained).toBe(true);
});
it('blocks further spending if reported usage exceeds the original price bound', async () => {
  const ledger = createLivCostLedger(() => now), reservation = await ledger.reserve(call());
  await ledger.complete(reservation, { ...outcome, usage: { ...outcome.usage, inputTokens: 1_000_000 } });
  expect(memory.rows.get('livCostLedger/month-2026-09').blocked).toBe(true);
  await expect(ledger.reserve(call(2))).rejects.toThrow('requires_reconciliation');
  expect(getLivCostPretransportError(await ledger.reserve(call(3)).catch(error => error))).toBeNull();
});
it('blocks an unexpected billed model without using a guessed lower rate', async () => {
  const ledger = createLivCostLedger(() => now), reservation = await ledger.reserve(call());
  await ledger.complete(reservation, { ...outcome, responseModel: 'unpriced-model' });
  expect(memory.rows.get('livCostLedger/month-2026-09')).toMatchObject({ blocked: true, reservedDkkMicros: reservation.reservedDkkMicros });
});
it.each([null, { ...policy, usdToDkkCeiling: 0 }, { ...policy, validUntil: 'invalid-date' },
  { ...policy, monthlyLimitDkkMicros: 301_000_000 }, { ...policy, priceVersion: 'guessed' }])('requires an explicit valid bounded policy %j', async value => {
  memory.rows.set('livCostLedger/policy', value);
  await expect(createLivCostLedger(() => now).reserve(call())).rejects.toThrow('policy_missing_or_expired');
  expect(memory.rows.size).toBe(1);
});
it('retains separate Copenhagen-month ledgers and never reuses or rewrites a call ID', async () => {
  const ledger = createLivCostLedger(() => now);
  await ledger.reserve(call()); await expect(ledger.reserve(call())).rejects.toThrow('already_reserved');
  memory.rows.set('livCostLedger/policy', { ...policy, validUntil: '2026-10-10T00:00:00Z' });
  await createLivCostLedger(() => new Date('2026-09-30T22:01:00Z')).reserve(call(2));
  expect(memory.rows.has('livCostLedger/month-2026-09')).toBe(true);
  expect(memory.rows.has('livCostLedger/month-2026-10')).toBe(true);
});
it('enforces durable per-run and monthly call ceilings even with ample DKK allowance', async () => {
  const ledger = createLivCostLedger(() => now);
  memory.rows.set('livCostLedger/run-2026-09-prepare-2026-09-13', { calls: LIV_COST_MAX_CALLS_PER_RUN });
  await expect(ledger.reserve(call())).rejects.toThrow('call_limit_exceeded');
  memory.rows.delete('livCostLedger/run-2026-09-prepare-2026-09-13');
  memory.rows.set('livCostLedger/month-2026-09', { calls: LIV_COST_MAX_CALLS_PER_MONTH, unknownCalls: 0, reservedDkkMicros: 0, committedDkkMicros: 1 });
  await expect(ledger.reserve(call())).rejects.toThrow('call_limit_exceeded');
});
it('reports only tracked cost estimates, unknown historical billing and incomplete coverage', async () => {
  const ledger = createLivCostLedger(() => now), reservation = await ledger.reserve(call());
  const summary = await readLivCostSummary(now);
  expect(summary).toMatchObject({ status: 'ready_partial', pricingStatus: 'verified', trackedCalls: 1, unknownCalls: 1,
    billedDkk: null, fullMonthlyCapVerified: false, historicalCostsIncluded: false, reservedUpperDkk: reservation.reservedDkkMicros / 1_000_000 });
  expect(summary.availableAllowanceDkk).toBeLessThan(300);
});
it('does not represent an absent ledger, absent policy, or unavailable database as zero actual spend', async () => {
  expect(await readLivCostSummary(now)).toMatchObject({ trackedCalls: null, usageBasedUpperDkk: null, billedDkk: null });
  memory.rows.delete('livCostLedger/policy');
  expect(await readLivCostSummary(now)).toMatchObject({ status: 'unconfigured', availableAllowanceDkk: null });
  memory.available = false;
  expect(await readLivCostSummary(now)).toMatchObject({ status: 'unavailable', billedDkk: null });
});
it('reports unpriced model configuration explicitly', async () => {
  vi.stubEnv('LIV_GENERATION_MODEL', 'gpt-unlisted');
  expect(await readLivCostSummary(now)).toMatchObject({ status: 'blocked', pricingStatus: 'missing_or_expired' });
  expect(await readLivCostSummary(new Date('2026-11-01'))).toMatchObject({ pricingStatus: 'missing_or_expired' });
});
it('keeps the review reminder visible without a calendar-triggered unattended shutdown', async () => {
  const later = new Date('2026-11-01T12:00:00Z');
  await expect(createLivCostLedger(() => later).reserve(call())).resolves.toMatchObject({ month: '2026-11', policy });
  expect(await readLivCostSummary(later)).toMatchObject({ status: 'ready_partial', pricingStatus: 'review_due', billedDkk: null });
  expect(await readLivCostSummary(new Date('2026-10-02'))).toMatchObject({ status: 'ready_partial', pricingStatus: 'review_due' });
});
it('reconciles thirty daily searches to usage plus tool fees, not thirty full-context holds', async () => {
  const searchQuote = quoteLivOpenAIRequest('/responses', { model: 'gpt-5.6-sol', input: 'Dagens kultur',
    tools: [{ type: 'web_search' }], max_tool_calls: 1, max_output_tokens: 3000 });
  const ledger = createLivCostLedger(() => now);
  for (let n = 1; n <= 30; n++) {
    const reservation = await ledger.reserve({ ...call(n), context: { runId: `day-${n}`, stage: 'research' }, quote: searchQuote });
    await ledger.complete(reservation, { ...outcome, responseModel: searchQuote.model,
      usage: { ...outcome.usage, inputTokens: 1000, outputTokens: 500, toolCalls: 1 } });
  }
  const summary = await readLivCostSummary(now);
  expect(summary).toMatchObject({ trackedCalls: 30, unknownCalls: 0, reservedUpperDkk: 0, status: 'ready_partial' });
  expect(summary.usageBasedUpperDkk).toBeCloseTo(8.4);
});

it('requires explicit shared policy without changing existing Liv authorization', async () => {
  const ledger = createLivCostLedger(() => now);
  await expect(ledger.reserve({ ...call(), context: { ...call().context, scope: 'writer' } })).rejects.toThrow('shared_policy_unconfigured');
  await expect(ledger.reserve(call())).resolves.toBeDefined();
  expect(memory.rows.get('livCostLedger/policy')).toEqual(policy);
});
it('shares the existing 300DKK balance across Liv, Writer and SEO without importing costs twice', async () => {
  memory.rows.set('livCostLedger/policy', { ...policy, sharedScopesEnabled: true, sharedTrackingStartedAt: now.toISOString() });
  memory.rows.set('livCostLedger/month-2026-09', {
    committedDkkMicros: 44_760_000, reservedDkkMicros: 0, calls: 7, unknownCalls: 0,
    trackingStartedAt: '2026-09-01T10:00:00Z',
  });
  const ledger = createLivCostLedger(() => now);
  const results = await Promise.allSettled(([undefined, 'writer', 'seo'] as const).map((scope, i) =>
    ledger.reserve({ ...call(i + 1), context: { ...call().context, runId: `operation-${i}`, ...(scope ? { scope } : {}) },
      quote: { ...quote, reservedUsdMicros: 16_000_000 } })));
  expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
  expect(memory.rows.get('livCostLedger/month-2026-09')).toMatchObject({ committedDkkMicros: 44_760_000, reservedDkkMicros: 128_000_000, calls: 8 });
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  expect(await readSharedCostSummary(now)).toMatchObject({ sharedActivation: 'enabled', usageBasedUpperDkk: 44.76,
    unscopedOpenAIBehavior: 'deny_before_transport',
    includedScopes: ['liv', 'writer', 'seo', 'accreditation'], historicalCostsIncluded: false, fullMonthlyCapVerified: false,
    existingLivCostsIncluded: true, billedDkk: null, availableAllowanceDkk: 127.24 });
});
it('reports policy/activation failures and rollback without erasing shared history', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  expect(await readSharedCostSummary(now)).toMatchObject({ sharedActivation: 'policy_required' });
  memory.rows.set('livCostLedger/policy', { ...policy, sharedScopesEnabled: true, sharedTrackingStartedAt: now.toISOString() });
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'false');
  expect(await readSharedCostSummary(now)).toMatchObject({ sharedActivation: 'disabled', unscopedOpenAIBehavior: 'not_enforced',
    excludedScopes: expect.arrayContaining(['unscoped_openai_calls']), includedScopes: ['liv', 'writer', 'seo', 'accreditation'] });
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'typo');
  expect(await readSharedCostSummary(now)).toMatchObject({ sharedActivation: 'invalid_flag', unscopedOpenAIBehavior: 'invalid_configuration' });
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true'); memory.available = false;
  expect(await readSharedCostSummary(now)).toMatchObject({ sharedActivation: 'unavailable', status: 'unavailable' });
});

it('reports actual accreditation and podcast boundaries without claiming invoice coverage', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  vi.stubEnv('PODCAST_PROCESSOR_URL', '');
  expect((await readSharedCostSummary(now)).excludedScopes).toContain('accreditation_other_calls');
  memory.rows.set('livCostLedger/policy', { ...policy, sharedScopesEnabled: true, sharedTrackingStartedAt: now.toISOString() });
  const enabled = await readSharedCostSummary(now);
  expect(enabled.excludedScopes).toEqual(['other_providers', 'historical_untracked_calls']);
  expect(enabled.fullMonthlyCapVerified).toBe(false);
  vi.stubEnv('PODCAST_PROCESSOR_URL', 'https://processor.example.invalid');
  expect((await readSharedCostSummary(now)).excludedScopes).toContain('external_podcast_processor');
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'false');
  expect((await readSharedCostSummary(now)).excludedScopes).toContain('accreditation_other_calls');
});

it('preflights default Writer/SEO prices and activates only by explicit compare-and-set without touching totals', async () => {
  expect(inspectSharedCostActivation().ready).toBe(true);
  const totals = { committedDkkMicros: 44_760_000, reservedDkkMicros: 99, calls: 7, unknownCalls: 1 };
  memory.rows.set('livCostLedger/month-2026-09', totals);
  const args = { deploymentSha: 'a'.repeat(40), expectedPolicy: policy };
  await expect(activateSharedCostPolicy({ ...args, expectedPolicy: { ...policy, usdToDkkCeiling: 9 } }, now)).rejects.toThrow('policy_changed');
  expect(memory.rows.get('livCostLedger/policy')).toEqual(policy);
  await activateSharedCostPolicy(args, now);
  const original = structuredClone([...memory.rows]);
  await activateSharedCostPolicy(args, new Date(now.getTime() + 1000));
  expect([...memory.rows]).toEqual(original);
  expect(memory.rows.get('livCostLedger/month-2026-09')).toEqual(totals);
  expect(memory.rows.get('livCostLedger/policy')).toEqual({ ...policy, sharedScopesEnabled: true, sharedTrackingStartedAt: now.toISOString() });
  expect(memory.rows.get(`livCostLedger/shared-activation-${args.deploymentSha}`)).toMatchObject({ historicalCostsImported: false });
});
it('refuses activation if any configured baseline model lacks a verified quote', async () => {
  vi.stubEnv('LIV_UTILITY_MODEL', 'gpt-unpriced');
  expect(inspectSharedCostActivation().ready).toBe(false);
  await expect(activateSharedCostPolicy({ deploymentSha: 'a'.repeat(40), expectedPolicy: policy }, now)).rejects.toThrow('activation_unpriced');
  expect(memory.rows.size).toBe(1);
});

it('isolates the image-gen 150 DKK ledger from Liv even when Liv is exhausted', async () => {
  memory.rows.set('imageGenCostLedger/policy', { ...policy, monthlyLimitDkkMicros: 150_000_000 });
  const livTotals = { committedDkkMicros: 300_000_000, reservedDkkMicros: 0, calls: 999, unknownCalls: 0 };
  memory.rows.set('livCostLedger/month-2026-09', livTotals);
  const ledger = createLivCostLedger(() => now, 'image-gen');
  const input = { ...call(), context: { ...call().context, scope: 'image-gen' as const } };
  const reservation = await ledger.reserve(input);
  expect(reservation.scope).toBe('image-gen');
  await ledger.complete(reservation, outcome);
  expect(memory.rows.get('livCostLedger/month-2026-09')).toEqual(livTotals);
  expect(memory.rows.get('imageGenCostLedger/month-2026-09').calls).toBe(1);
  await expect(createLivCostLedger(() => now).complete(reservation, outcome)).rejects.toThrow('bucket_mismatch');
});
it('refuses cross-bucket scopes, an excessive image budget and parallel overspending', async () => {
  const ledger = createLivCostLedger(() => now, 'image-gen');
  const input = { ...call(), context: { ...call().context, scope: 'image-gen' as const } };
  memory.rows.set('imageGenCostLedger/policy', policy);
  await expect(ledger.reserve(input)).rejects.toThrow('unconfigured');
  memory.rows.set('imageGenCostLedger/policy', { ...policy, monthlyLimitDkkMicros: 150_000_000 });
  await expect(ledger.reserve(call())).rejects.toThrow('unconfigured');
  await expect(createLivCostLedger(() => now).reserve(input)).rejects.toThrow('unconfigured');
  const amount = Math.ceil(quote.reservedUsdMicros * policy.usdToDkkCeiling);
  memory.rows.set('imageGenCostLedger/month-2026-09', { committedDkkMicros: 150_000_000 - amount,
    reservedDkkMicros: 0, calls: 0, unknownCalls: 0 });
  const results = await Promise.allSettled([ledger.reserve(input), ledger.reserve({ ...input, callId: call(2).callId })]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(memory.rows.get('imageGenCostLedger/month-2026-09').calls).toBe(1);
});
