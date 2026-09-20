import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), available: true, auth: vi.fn(), claim: vi.fn(),
  release: vi.fn(), writes: vi.fn(), queue: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: state.auth }));
vi.mock('@/lib/liv/delivery-store', () => ({ claimPreparation: state.claim, releasePreparation: state.release }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.available ? {
  collection: (collection: string) => ({ doc: (id: string) => ({ path: `${collection}/${id}` }) }),
  runTransaction: (run: any) => {
    const task = state.queue.catch(() => {}).then(async () => {
      const writes: Array<[string, any]> = [];
      const put = (ref: any, value: any) => writes.push([ref.path, value]);
      const result = await run({ get: async (ref: any) => {
        if (writes.length) throw Error('read_after_write');
        return { exists: state.rows.has(ref.path), data: () => state.rows.get(ref.path) };
      }, create: (ref: any, value: any) => { if (state.rows.has(ref.path)) throw Error('exists'); put(ref, value); },
      set: put, update: (ref: any, value: any) => put(ref, { ...state.rows.get(ref.path), ...value }) });
      for (const [path, value] of writes) { state.writes(path); state.rows.set(path, value); }
      return result;
    }); state.queue = task; return task;
  },
} : null }));
import { POST } from '@/app/api/liv/operations/queue-plan/route';
import { scheduleLivQueue } from '@/lib/liv/queue-plan';
import { emptyDeliveryState, scheduledPreparationDays } from '@/lib/liv/delivery-policy';
import { nextScheduledPreparation } from '@/lib/liv/next-preparation';

const input = { requestId: 'queue-20260920', plans: [
  { dayKey: '2026-09-22', topicHint: 'A current series', directiveHint: 'Independent sourced review with official images.', articleFormat: 'research-review' },
  { dayKey: '2026-09-23', topicHint: 'A cultural feature', directiveHint: 'Independent sourced cultural feature.', articleFormat: 'article', editorialKind: 'feature' },
] };
const request = (body: unknown = input, query = '') => new NextRequest(`https://app.example/api/liv/operations/queue-plan${query}`, {
  method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer test-only' },
});
beforeEach(() => {
  vi.resetAllMocks(); state.rows.clear(); state.available = true; state.queue = Promise.resolve();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-20T19:00:00Z'));
  vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  state.claim.mockResolvedValue('lease'); state.release.mockResolvedValue(undefined);
  state.rows.set('livDelivery/manifest', { ...emptyDeliveryState(), preparation: { token: 'lease', leaseUntil: Date.now() + 360000 },
    entries: [{ itemId: 'paid', state: 'ready', kind: 'scheduled', scheduledDay: '2026-09-21', expiresDay: '2026-09-21' }] });
  state.rows.set('livDailyArticles/prepare-2026-09-21', { articleCheckpoint: 'paid', preparationAttempts: 3 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('schedules the exact formats atomically, retaining ready/paid work and default one-day policy', async () => {
  const paid = structuredClone(state.rows.get('livDailyArticles/prepare-2026-09-21'));
  const r = await POST(request());
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ status: 'scheduled', days: ['2026-09-22', '2026-09-23'] });
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(state.rows.get('livDailyArticles/prepare-2026-09-21')).toEqual(paid);
  expect(state.rows.get('livDailyPlan/plan-2026-09-22')).toMatchObject({ articleFormat: 'research-review', mustUseTrending: false });
  expect(state.rows.get('livDailyPlan/plan-2026-09-23')).toMatchObject({ editorialKind: 'feature', articleFormat: 'article' });
  expect(state.rows.get('livDelivery/manifest').entries[0].itemId).toBe('paid');
  expect(scheduledPreparationDays(emptyDeliveryState(), '2026-09-20')).toEqual(['2026-09-20', '2026-09-21']);
  expect(state.release).toHaveBeenCalledWith('lease');
});

it('replays a committed batch without rewrites or a fresh generation, even after the dates have passed', async () => {
  await POST(request()); state.writes.mockClear(); vi.setSystemTime(new Date('2026-10-01T19:00:00Z'));
  expect(await (await POST(request())).json()).toMatchObject({ status: 'already_scheduled' });
  expect(state.writes).not.toHaveBeenCalled();
  expect(scheduledPreparationDays(state.rows.get('livDelivery/manifest'), '2026-10-01')).toEqual(['2026-10-01', '2026-10-02']);
});

it('binds changed input to a conflict instead of replacing it', async () => {
  await POST(request()); state.writes.mockClear();
  const changed = structuredClone(input); changed.plans[0].topicHint = 'Another topic';
  expect((await POST(request(changed))).status).toBe(409); expect(state.writes).not.toHaveBeenCalled();
});

it.each(['daily', 'prepare', 'prepare-alternative', 'reserve', 'reserve-editorial'])('preserves all existing %s runs, including failed ones', async scope => {
  state.rows.set(`livDailyArticles/${scope}-2026-09-23`, { status: 'failed' });
  expect(await (await POST(request())).json()).toEqual({ error: 'liv_queue_occupied' });
  expect(state.writes).not.toHaveBeenCalled();
});

it.each(['entry', 'slot', 'manual-plan', 'used-plan', 'held', 'cover', 'expired', 'wrong-token', 'limit'])('fails without partial writes for %s', async kind => {
  const manifest = state.rows.get('livDelivery/manifest');
  if (kind === 'entry') manifest.entries.push({ scheduledDay: '2026-09-23', state: 'rejected' });
  if (kind === 'slot') manifest.slots['2026-09-23'] = { state: 'published' };
  if (kind === 'manual-plan') state.rows.set('livDailyPlan/plan-2026-09-23', { createdBy: 'editor', status: 'pending' });
  if (kind === 'used-plan') state.rows.set('livDailyPlan/plan-2026-09-23', { createdBy: 'liv-rolling-plan', status: 'used' });
  if (kind === 'held') manifest.slots['2026-09-20'] = { state: 'attempted' };
  if (kind === 'cover') manifest.coverRevision = { id: 'revision' };
  if (kind === 'expired') manifest.preparation.leaseUntil = Date.now();
  if (kind === 'wrong-token') manifest.preparation.token = 'other';
  if (kind === 'limit') manifest.editorialPreparationDays = ['2026-09-24', '2026-09-25'];
  expect((await POST(request())).status).toBe(409); expect(state.writes).not.toHaveBeenCalled();
});

it('archives only an unused automatic plan when replacing it with an explicit editorial choice', async () => {
  const plan = { createdBy: 'liv-rolling-plan', status: 'pending', directiveHint: 'default question' };
  state.rows.set('livDailyPlan/plan-2026-09-22', plan);
  expect((await POST(request())).status).toBe(200);
  expect(state.rows.get('livQueuePlans/queue-20260920').previousPlans[0].plan).toEqual(plan);
});

it('keeps an old unpaid missing-topic row intact, archives its bare plan marker and uses the shared retry policy', async () => {
  const row = { dayKey: '2026-09-22', status: 'skipped_no_topic', topic: null,
    reason: 'Ingen trending-artikler matcher', preparationAttempts: 99, gateResults: [], completedAt: '2026-09-11T10:00:00Z' };
  const marker = { status: 'failed', failedReason: 'Ingen emner matchede planens hint.' };
  state.rows.set('livDailyArticles/prepare-2026-09-22', row);
  state.rows.set('livDailyPlan/plan-2026-09-22', marker);
  expect((await POST(request())).status).toBe(200);
  expect(state.rows.get('livDailyArticles/prepare-2026-09-22')).toEqual(row);
  expect(state.rows.get('livQueuePlans/queue-20260920').previousPlans[0].plan).toEqual(marker);
  expect(await nextScheduledPreparation(state.rows.get('livDelivery/manifest'), async day => day === row.dayKey ? row : undefined))
    .toMatchObject({ dayKey: '2026-09-22', decision: { action: 'retry', reasonCode: 'source_retry_scheduled' } });
});

it.each(['articleCheckpoint', 'resumeWritingRunId', 'webflowItemId', 'rawResponse', 'unknownPaidField'])('never adopts a no-topic record with %s', async key => {
  state.rows.set('livDailyArticles/prepare-2026-09-22', { status: 'skipped_no_topic', topic: null, [key]: 'saved' });
  expect((await POST(request())).status).toBe(409); expect(state.writes).not.toHaveBeenCalled();
});

it.each(['auth', 'disabled', 'paused', 'busy', 'store'])('handles %s without writes', async kind => {
  if (kind === 'auth') state.auth.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  if (kind === 'disabled') vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'false');
  if (kind === 'paused') vi.stubEnv('LIV_DAILY_PAUSED', 'TRUE');
  if (kind === 'busy') state.claim.mockResolvedValue(null);
  if (kind === 'store') state.available = false;
  expect((await POST(request())).status).toBe(kind === 'auth' ? 403 : kind === 'store' ? 503 : 409);
  expect(state.writes).not.toHaveBeenCalled();
});

it.each(['2026-09-20', '2026-09-19', '2026-09-28', '2026-02-30'])('rejects invalid date %s', async dayKey => {
  expect((await POST(request({ ...input, plans: [{ ...input.plans[0], dayKey }] }))).status).toBe(400);
  expect(state.writes).not.toHaveBeenCalled();
});

it.each([
  { ...input, plans: [] }, { ...input, plans: [...input.plans, ...input.plans] },
  { ...input, plans: [input.plans[0], input.plans[0]] }, { ...input, requestId: '../bad' },
  { ...input, plans: [{ ...input.plans[0], editorialKind: 'feature' }] },
  { ...input, plans: [{ ...input.plans[0], directiveHint: '<script>bad</script>' }] },
  { ...input, scope: 'daily' },
])('rejects invalid batch/schema before claiming', async body => {
  expect((await POST(request(body))).status).toBe(400); expect(state.claim).not.toHaveBeenCalled();
});

it('rejects query/malformed bodies and safely hides infrastructure errors', async () => {
  expect((await POST(request(input, '?dryRun=1'))).status).toBe(400);
  expect((await POST(new NextRequest('https://app.example/api/liv/operations/queue-plan', { method: 'POST', body: '{' }))).status).toBe(400);
  state.claim.mockRejectedValue(Error('secret private error'));
  expect(await (await POST(request())).json()).toEqual({ error: 'liv_queue_failed' });
});

it('serializes competing requests: exactly one batch owns each day', async () => {
  const results = await Promise.allSettled([scheduleLivQueue(input, 'lease'), scheduleLivQueue({ ...input, requestId: 'competing-id' }, 'lease')]);
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
});

it('worker selects only explicit future dates after the ready article; keeps budget/provider holds', async () => {
  await POST(request()); const manifest = state.rows.get('livDelivery/manifest');
  expect(await nextScheduledPreparation(manifest, async () => undefined)).toMatchObject({ dayKey: '2026-09-22', scope: 'prepare' });
  expect(await nextScheduledPreparation(manifest, async () => ({ status: 'failed', reason: 'liv_cost_monthly_budget_exceeded' })))
    .toMatchObject({ dayKey: '2026-09-22', decision: { action: 'blocked', reasonCode: 'budget_limit' } });
  manifest.editorialPreparationDays = ['2026-09-19', 'bad', '2026-09-30'];
  expect(await nextScheduledPreparation(manifest, async () => undefined)).toBeNull();
});
