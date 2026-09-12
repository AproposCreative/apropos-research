import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), available: true, auth: vi.fn(), claim: vi.fn(), release: vi.fn(),
  plan: vi.fn(), run: vi.fn(), tx: vi.fn(), reads: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: state.auth }));
vi.mock('@/lib/liv/delivery-store', () => ({ claimPreparation: state.claim, releasePreparation: state.release }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ getLivDailyPlan: state.plan }));
vi.mock('@/lib/liv/run-daily', () => ({ runLivDaily: state.run }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.available ? {
  collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
  runTransaction: state.tx,
} : null }));
import { POST } from '@/app/api/liv/operations/continue/route';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';

const day = '2026-09-15', runPath = `livDailyArticles/prepare-${day}`, planPath = `livDailyPlan/plan-${day}`;
const input = { dayKey: day, kind: 'scheduled' };
const request = (body: unknown = input, query = '') => new NextRequest(`https://app.example/api/liv/operations/continue${query}`, {
  method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer test-only' },
});
beforeEach(() => {
  vi.resetAllMocks(); state.rows.clear(); state.available = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
  vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  state.claim.mockResolvedValue('lease'); state.release.mockResolvedValue(undefined);
  const article = { title: 'Saved topic', slug: 'saved-topic', intro: 'Saved intro', content: '<p>Saved paid text.</p>',
    rawResponse: 'immutable original', preparedMedia: [{ role: 'hero', url: 'https://example.test/saved.jpg' }] };
  state.rows.set(runPath, { dayKey: day, status: 'processing', continuationReady: true, articleCheckpoint: article,
    articleCheckpointHash: livImageArticleHash(article), preparationAttempts: 6 });
  state.rows.set(planPath, { dayKey: day, topicHint: 'Saved topic', directiveHint: 'Saved direction', articleFormat: 'article',
    mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null });
  state.rows.set('livDelivery/manifest', { slots: {}, preparation: { token: 'lease', leaseUntil: Date.now() + 360000 } });
  state.rows.set('livDailyArticles/prepare-2026-09-13', { status: 'failed', topic: 'Oasis', paid: 'preserved' });
  state.rows.set('livDailyArticles/reserve-editorial-2026-09-12', { status: 'draft', topic: 'Gentlemen', webflowItemId: 'preserved' });
  state.plan.mockImplementation(async key => structuredClone(state.rows.get(`livDailyPlan/plan-${key}`) || null));
  state.tx.mockImplementation(async fn => fn({ get: async (ref: { path: string }) => {
    state.reads(ref.path); return { data: () => state.rows.get(ref.path) };
  } })); // Deliberately no transaction write methods: validation must remain read-only.
  state.run.mockResolvedValue(NextResponse.json({ status: 'media_prepared', title: 'Not exposed', diagnostic: 'Not exposed' }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('continues only the existing prepare namespace with its saved plan and no mutations or retry grants', async () => {
  const before = structuredClone([...state.rows]);
  const response = await POST(request());
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'media_prepared', dayKey: day });
  expect(state.run).toHaveBeenCalledExactlyOnceWith(expect.anything(), { dayKey: day, kind: 'scheduled', defaultPlan: state.rows.get(planPath) });
  expect(state.reads.mock.calls.map(([path]) => path)).toContain(runPath);
  expect([...state.rows]).toEqual(before); expect(state.release).toHaveBeenCalledExactlyOnceWith('lease');
});

it.each(['2026-09-12', '2026-09-19'])('allows bounded date %s with existing saved work', async date => {
  state.rows.set(`livDailyArticles/prepare-${date}`, { ...state.rows.get(runPath), dayKey: date });
  state.rows.set(`livDailyPlan/plan-${date}`, { ...state.rows.get(planPath), dayKey: date });
  expect((await POST(request({ ...input, dayKey: date }))).status).toBe(200);
});

it.each([{ ...input, dayKey: '2026-09-11' }, { ...input, dayKey: '2026-09-20' }, { ...input, dayKey: '2026-02-30' },
  { ...input, kind: 'reserve' }, { ...input, scope: 'prepare' }, { ...input, topicHint: 'New' },
  { ...input, requestId: 'new' }, { ...input, plan: {} }, { ...input, skipGates: true }, {}])('rejects invalid input %j before claims', async body => {
  expect((await POST(request(body))).status).toBe(400); expect(state.claim).not.toHaveBeenCalled(); expect(state.run).not.toHaveBeenCalled();
});

it('rejects queries, malformed JSON and oversized bodies', async () => {
  expect((await POST(request(input, '?dryRun=1'))).status).toBe(400);
  for (const body of ['{', 'x'.repeat(1001)]) expect((await POST(new NextRequest('https://app.example/api/liv/operations/continue', { method: 'POST', body }))).status).toBe(400);
  expect(state.claim).not.toHaveBeenCalled();
});

it.each(['auth', 'disabled', 'paused', 'busy'])('stops %s before validation or workflow dispatch', async kind => {
  if (kind === 'auth') state.auth.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  if (kind === 'disabled') vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'false');
  if (kind === 'paused') vi.stubEnv('LIV_DAILY_PAUSED', 'TRUE');
  if (kind === 'busy') state.claim.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(kind === 'auth' ? 403 : 409);
  expect(state.run).not.toHaveBeenCalled(); expect(state.tx).not.toHaveBeenCalled(); expect(state.release).not.toHaveBeenCalled();
});

it.each(['missing', 'failed', 'skipped_factcheck', 'draft', 'published', 'not-yielded', 'no-article', 'bad-content', 'hash',
  'wrong-day', 'webflowItemId', 'preparationProof', 'cmsSaveStarted', 'retryAuthorization', 'plan-missing', 'plan-used', 'plan-changed',
  'lease-missing', 'lease-expired', 'lease-token', 'cover', 'attempted', 'day-slot'])(
  'blocks unsafe continuation %s without dispatching', async kind => {
    const row = state.rows.get(runPath), manifest = state.rows.get('livDelivery/manifest');
    if (kind === 'missing') state.rows.delete(runPath);
    if (['failed', 'skipped_factcheck', 'draft', 'published'].includes(kind)) row.status = kind;
    if (kind === 'not-yielded') row.continuationReady = false;
    if (kind === 'no-article') delete row.articleCheckpoint;
    if (kind === 'bad-content') row.articleCheckpoint.content = null;
    if (kind === 'hash') row.articleCheckpointHash = 'changed';
    if (kind === 'wrong-day') row.dayKey = '2026-09-16';
    if (['webflowItemId', 'preparationProof', 'cmsSaveStarted', 'retryAuthorization'].includes(kind)) row[kind] = 'present';
    if (kind === 'plan-missing') state.rows.delete(planPath);
    if (kind === 'plan-used') state.rows.get(planPath).status = 'used';
    if (kind === 'plan-changed') state.plan.mockImplementation(async () => {
      const plan = structuredClone(state.rows.get(planPath)); state.rows.get(planPath).directiveHint = 'changed'; return plan;
    });
    if (kind === 'lease-missing') delete manifest.preparation;
    if (kind === 'lease-expired') manifest.preparation.leaseUntil = Date.now();
    if (kind === 'lease-token') manifest.preparation.token = 'other';
    if (kind === 'cover') manifest.coverRevision = { id: 'held' };
    if (kind === 'attempted') manifest.slots['2026-09-11'] = { state: 'attempted' };
    if (kind === 'day-slot') manifest.slots[day] = { state: 'published' };
    expect((await POST(request())).status).toBe(409); expect(state.run).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledWith('lease');
  },
);

it('does not dispatch twice while the shared lease is held', async () => {
  state.claim.mockResolvedValueOnce('lease').mockResolvedValueOnce(null);
  const responses = await Promise.all([POST(request()), POST(request())]);
  expect(responses.map(response => response.status)).toEqual([200, 409]); expect(state.run).toHaveBeenCalledOnce();
});

it('cannot repeat a consumed stage or turn a failure into a retry', async () => {
  state.run.mockImplementation(async () => { state.rows.get(runPath).continuationReady = false; return NextResponse.json({ error: 'private upstream' }, { status: 500 }); });
  expect(await (await POST(request())).json()).toEqual({ status: 'blocked_saved_work', dayKey: day });
  expect((await POST(request())).status).toBe(409); expect(state.run).toHaveBeenCalledOnce();
});

it.each(['text_prepared', 'facts_revised', 'research_supplemented', 'media_prepared', 'ready'])('returns bounded stage %s without internal output', async status => {
  state.run.mockResolvedValue(NextResponse.json({ status, queued: status === 'ready', error: 'private', title: 'private' }));
  expect(await (await POST(request())).json()).toEqual({ status, dayKey: day });
});

it.each([{ status: 'media_pending' }, { status: 'partial' }, { status: 'ready' },
  { status: 'draft', queued: false }, { error: 'liv_media_preparation_incomplete' }])('never labels incomplete/unknown output ready: %j', async body => {
  state.run.mockResolvedValue(NextResponse.json(body));
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ status: 'blocked_saved_work', dayKey: day });
});

it('maps actual successful queue admission without requiring an upstream status field', async () => {
  state.run.mockResolvedValue(NextResponse.json({ ok: true, queued: true, webflowStatus: 'draft', publicationVerified: false }));
  expect(await (await POST(request())).json()).toEqual({ status: 'ready', dayKey: day });
});

it('does not trust queued or prepared markers on a failed upstream response', async () => {
  state.run.mockResolvedValue(NextResponse.json({ queued: true, status: 'media_prepared' }, { status: 500 }));
  const response = await POST(request());
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ status: 'blocked_saved_work', dayKey: day });
});

it('sanitizes unexpected errors and releases the lease', async () => {
  state.run.mockRejectedValue(new Error('private provider token'));
  const response = await POST(request()); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'liv_continue_failed' }); expect(state.release).toHaveBeenCalledWith('lease');
});
