import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), available: true, auth: vi.fn(), claim: vi.fn(),
  release: vi.fn(), run: vi.fn(), writes: vi.fn(), queue: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: state.auth }));
vi.mock('@/lib/liv/delivery-store', () => ({ claimPreparation: state.claim, releasePreparation: state.release }));
vi.mock('@/lib/liv/run-daily', () => ({ runLivDaily: state.run }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.available ? {
  collection: (collection: string) => ({ doc: (id: string) => ({ path: `${collection}/${id}` }) }),
  runTransaction: (run: any) => {
    const task = state.queue.catch(() => {}).then(async () => {
      const writes: Array<[string, any]> = [];
      const result = await run({ get: async (ref: any) => ({ data: () => state.rows.get(ref.path) }),
        create: (ref: any, value: any) => { if (state.rows.has(ref.path)) throw new Error('exists'); writes.push([ref.path, value]); } });
      for (const [path, value] of writes) { state.writes(path); state.rows.set(path, value); }
      return result;
    });
    state.queue = task; return task;
  },
} : null }));
import { POST } from '@/app/api/liv/operations/prepare/route';
import { reserveExplicitLivPreparation } from '@/lib/liv/explicit-preparation';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';

const dayKey = '2026-09-12', id = `reserve-editorial-${dayKey}`;
const runPath = `livDailyArticles/${id}`, reservationPath = `livExplicitPreparations/${id}`;
const input = { requestId: 'tv-review-20260912', dayKey, topicHint: 'The Gentlemen sæson 2',
  directiveHint: 'Skriv en researchanmeldelse med dokumenterede styrker, svagheder og officielle fotos. Kilder: https://www.netflix.com/tudum/ https://soundvenue.com/ https://www.whats-on-netflix.com/',
  articleFormat: 'research-review' as const };
const request = (body: unknown = input, query = '') => new NextRequest(`https://app.example/api/liv/operations/prepare${query}`, {
  method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer test-only' },
});
const article = { title: 'Saved TV review', slug: 'saved-tv-review', intro: 'Saved intro', content: 'Saved paid text' };
const yieldRow = (extra = {}) => Object.assign(state.rows.get(runPath), { status: 'processing', continuationReady: true,
  articleCheckpoint: article, articleCheckpointHash: livImageArticleHash(article), preparationAttempts: 1, ...extra });

beforeEach(() => {
  vi.resetAllMocks(); state.rows.clear(); state.available = true; state.queue = Promise.resolve();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
  vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  state.claim.mockResolvedValue('lease'); state.release.mockResolvedValue(undefined);
  state.rows.set('livDelivery/manifest', { slots: { [dayKey]: { state: 'published', itemId: 'today' } },
    preparation: { token: 'lease', leaseUntil: Date.now() + 360000 } });
  state.rows.set(`livDailyArticles/daily-${dayKey}`, { status: 'published', articleCheckpoint: 'today' });
  state.rows.set(`livDailyArticles/reserve-${dayKey}`, { status: 'failed', reason: 'article_evidence_insufficient' });
  state.rows.set('livDailyArticles/prepare-2026-09-13', { status: 'skipped_factcheck', topic: 'Oasis', preparationAttempts: 5 });
  state.run.mockImplementation(async () => NextResponse.json({ status: 'text_prepared', dayKey }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('atomically binds one immutable explicit reserve, delegating to the full shared workflow and preserving all other work', async () => {
  const before = structuredClone([...state.rows]);
  const result = await POST(request());
  expect(await result.json()).toEqual({ status: 'text_prepared', dayKey });
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(state.run).toHaveBeenCalledExactlyOnceWith(expect.any(NextRequest), { dayKey, kind: 'reserve', scope: 'reserve-editorial',
    defaultPlan: { dayKey, topicHint: input.topicHint, directiveHint: input.directiveHint, articleFormat: 'research-review',
      mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null } });
  expect(state.rows.get(reservationPath).input).toEqual(input);
  expect(state.rows.get(runPath)).not.toHaveProperty('retryAuthorization');
  expect(state.rows.get(runPath)).not.toHaveProperty('preparationAttempts');
  for (const [path, row] of before) expect(state.rows.get(path)).toEqual(row);
  expect(state.release).toHaveBeenCalledExactlyOnceWith('lease');
});

it('continues only identical input with a yielded hash-bound checkpoint, preserving text/media and counters', async () => {
  await POST(request()); yieldRow({ preparationAttempts: 5 });
  const before = structuredClone([...state.rows]); state.run.mockClear(); state.writes.mockClear();
  const reordered = { articleFormat: input.articleFormat, directiveHint: input.directiveHint, topicHint: input.topicHint,
    dayKey, requestId: input.requestId };
  expect((await POST(request(reordered))).status).toBe(200);
  expect(state.run).toHaveBeenCalledTimes(1); expect(state.writes).not.toHaveBeenCalled();
  expect([...state.rows]).toEqual(before);
});

it('replays the identical identity-only seed when the runner never claimed, without changing the reservation', async () => {
  await POST(request()); const before = structuredClone([...state.rows]); state.writes.mockClear(); state.run.mockClear();
  expect((await POST(request())).status).toBe(200);
  expect(state.run).toHaveBeenCalledTimes(1); expect(state.writes).not.toHaveBeenCalled();
  expect([...state.rows]).toEqual(before);
});

it.each([{ status: null }, { status: '' }, { preparationAttempts: 0 }, { gates: [] }, { reason: 'liv_cost_monthly_budget_exceeded' }])(
  'never treats a seeded row with any additional work state as an unpaid start', async patch => {
    await POST(request()); Object.assign(state.rows.get(runPath), patch); state.run.mockClear();
    expect((await POST(request())).status).toBe(409); expect(state.run).not.toHaveBeenCalled();
  });

it.each(['requestId', 'topicHint', 'directiveHint', 'articleFormat'])('rejects a changed %s on the same day', async key => {
  await POST(request()); yieldRow(); state.run.mockClear(); const before = structuredClone([...state.rows]);
  const changed = { ...input, [key]: key === 'articleFormat' ? 'article' : `${input[key as keyof typeof input]}-changed` };
  expect((await POST(request(changed))).status).toBe(409);
  expect(state.run).not.toHaveBeenCalled(); expect([...state.rows]).toEqual(before);
});

it.each(['failed', 'skipped_no_topic', 'skipped_factcheck', 'draft', 'published'])('never retries terminal %s even with a continuation or prior grant', async status => {
  await POST(request()); yieldRow({ status, retryAuthorization: 'old-grant', reason: 'liv_cost_monthly_budget_exceeded' });
  state.run.mockClear(); const before = structuredClone([...state.rows]);
  const result = await POST(request());
  expect(await result.json()).toEqual({ error: 'liv_prepare_blocked_saved_work', status: 'blocked_saved_work' });
  expect(state.run).not.toHaveBeenCalled(); expect([...state.rows]).toEqual(before);
});

it.each(['no-checkpoint', 'active', 'changed-text', 'cms', 'proof', 'cms-started', 'grant', 'crash-before-run'])(
  'retains uncertain work without dispatching: %s', async kind => {
    await POST(request()); yieldRow();
    const row = state.rows.get(runPath);
    if (kind === 'no-checkpoint') delete row.articleCheckpoint;
    if (kind === 'active') row.continuationReady = false;
    if (kind === 'changed-text') row.articleCheckpoint = { ...article, content: 'changed' };
    if (kind === 'cms') row.webflowItemId = 'saved';
    if (kind === 'proof') row.preparationProof = {};
    if (kind === 'cms-started') row.cmsSaveStarted = true;
    if (kind === 'grant') row.retryAuthorization = 'old-grant';
    if (kind === 'crash-before-run') delete row.status;
    state.run.mockClear();
    expect((await POST(request())).status).toBe(409); expect(state.run).not.toHaveBeenCalled();
  });

it('rejects an existing unrelated explicit-namespace run without adopting or rewriting it', async () => {
  state.rows.set(runPath, { status: 'failed', topic: 'Other story' });
  const before = structuredClone([...state.rows]);
  expect((await POST(request())).status).toBe(409); expect(state.run).not.toHaveBeenCalled();
  expect([...state.rows]).toEqual(before);
});

it.each(['auth', 'disabled', 'paused', 'busy'])('rejects %s before reserving input or invoking the workflow', async kind => {
  if (kind === 'auth') state.auth.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  if (kind === 'disabled') vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'false');
  if (kind === 'paused') vi.stubEnv('LIV_DAILY_PAUSED', 'TRUE');
  if (kind === 'busy') state.claim.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(kind === 'auth' ? 403 : 409);
  expect(state.writes).not.toHaveBeenCalled(); expect(state.run).not.toHaveBeenCalled();
  expect(state.release).not.toHaveBeenCalled();
});

it.each([
  { ...input, dayKey: '2026-09-13' }, { ...input, dayKey: '2026-09-11' }, { ...input, dayKey: '2026-02-30' },
  { ...input, requestId: '../secret' }, { ...input, articleFormat: 'review' }, { ...input, topicHint: '' },
  { ...input, directiveHint: '<script>bad</script>' }, { ...input, directiveHint: 'x'.repeat(9000) },
  { ...input, expandedDirective: 'override' }, { ...input, scope: 'daily' },
])('rejects invalid scope/date/format/text before claiming the lease', async body => {
  expect((await POST(request(body))).status).toBe(400); expect(state.claim).not.toHaveBeenCalled();
});

it('rejects dryRun query semantics and malformed JSON before claims', async () => {
  expect((await POST(request(input, '?dryRun=1'))).status).toBe(400);
  expect((await POST(new NextRequest('https://app.example/api/liv/operations/prepare', { method: 'POST', body: '{' }))).status).toBe(400);
  expect(state.claim).not.toHaveBeenCalled();
});

it.each(['expired', 'wrong-token', 'cover', 'uncertain-publish', 'missing-store'])('fails closed on %s', async kind => {
  const manifest = state.rows.get('livDelivery/manifest');
  if (kind === 'expired') manifest.preparation.leaseUntil = Date.now();
  if (kind === 'wrong-token') manifest.preparation.token = 'other';
  if (kind === 'cover') manifest.coverRevision = { id: 'held' };
  if (kind === 'uncertain-publish') manifest.slots[dayKey].state = 'attempted';
  if (kind === 'missing-store') state.available = false;
  expect((await POST(request())).status).toBe(kind === 'missing-store' ? 503 : 409);
  expect(state.writes).not.toHaveBeenCalled(); expect(state.run).not.toHaveBeenCalled();
  expect(state.release).toHaveBeenCalledWith('lease');
});

it('serializes competing reservations to one immutable request per day', async () => {
  const results = await Promise.allSettled([reserveExplicitLivPreparation(input, 'lease'),
    reserveExplicitLivPreparation({ ...input, requestId: 'another-request' }, 'lease')]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(state.rows.get(reservationPath).input.requestId).toBe(input.requestId);
});

it('returns only a safe error for thrown workflow failures, releasing the lease without resetting the reservation', async () => {
  state.run.mockRejectedValue(new Error('secret upstream body https://private.example/token'));
  const result = await POST(request());
  expect(await result.json()).toEqual({ error: 'liv_prepare_failed' });
  expect(state.rows.has(reservationPath)).toBe(true); expect(state.rows.has(runPath)).toBe(true);
  expect(state.release).toHaveBeenCalledWith('lease');
});
