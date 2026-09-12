import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), available: true, auth: vi.fn(), claim: vi.fn(),
  release: vi.fn(), writes: vi.fn(), provider: vi.fn(), queue: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: state.provider }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: state.auth }));
vi.mock('@/lib/liv/delivery-store', () => ({ claimPreparation: state.claim, releasePreparation: state.release }));
vi.mock('@/lib/firebase-admin', () => {
  const collection = (path: string): any => ({ doc: (id: string) => ({ path: `${path}/${id}`,
    collection: (name: string) => collection(`${path}/${id}/${name}`) }),
  where: (field: string, _op: string, value: unknown) => ({ limit: () => ({ path, field, value }) }) });
  return { getAdminDb: () => state.available ? { collection, runTransaction: (run: any) => {
    const task = state.queue.catch(() => {}).then(async () => {
      const writes: Array<[string, any]> = [];
      const result = await run({ get: async (ref: any) => ref.field
        ? { empty: ![...state.rows].some(([path, row]) => path.startsWith(`${ref.path}/`) && row[ref.field] === ref.value) }
        : { data: () => state.rows.get(ref.path) },
      create: (ref: any, value: any) => { if (state.rows.has(ref.path)) throw new Error('exists'); writes.push([ref.path, value]); },
      update: (ref: any, value: any) => { if (!state.rows.has(ref.path)) throw new Error('missing'); writes.push([ref.path, { ...state.rows.get(ref.path), ...value }]); } });
      for (const [path, value] of writes) { state.writes(path); state.rows.set(path, value); }
      return result;
    });
    state.queue = task; return task;
  } } : null };
});
import { POST } from '@/app/api/liv/operations/edit/route';
import { editLivEditorialCheckpoint } from '@/lib/liv/editorial-edit';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

const dayKey = '2026-09-12', runId = `reserve-editorial-${dayKey}`, runPath = `livDailyArticles/${runId}`;
const article = { title: 'The Gentlemen sæson 2', subtitle: 'Arven lugter af magt', slug: 'gentlemen', intro: 'En arving møder modstand.',
  content: '<p>En kandidat har allerede fået stillingen, men insisterer stadig på at kalde sig selvmodig. En anden må kæmpe for adgangen.</p>',
  excerpt: 'En arving med adgang.', seoTitle: 'The Gentlemen anmeldelse', seoDescription: 'Magt og adgang i sæson to.',
  rating: 4, ratingReason: 'En velspillet konflikt.', subjectType: 'tv-series', rawResponse: 'immutable paid original selvmodig',
  researchSources: [{ url: 'https://www.netflix.com/tudum/', contentHash: 'evidence' }],
  imageSuggestions: [{ url: 'https://images.example/photo.jpg' }], factRevisionCount: 0, aiModel: 'saved-model' };
const input = { requestId: 'copyedit-20260912', dayKey, scope: 'reserve-editorial', expectedArticleHash: livImageArticleHash(article),
  reason: 'Ret sproglig fejl efter redaktionel gennemlæsning.', patches: [{ field: 'content', before: 'selvmodig', after: 'selvskabt' }] };
const request = (body: unknown = input, query = '') => new NextRequest(`https://app.example/api/liv/operations/edit${query}`, {
  method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer test-only' },
});
beforeEach(() => {
  vi.resetAllMocks(); state.rows.clear(); state.available = true; state.queue = Promise.resolve();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
  vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  state.claim.mockResolvedValue('lease'); state.release.mockResolvedValue(undefined);
  state.rows.set('livDelivery/manifest', { slots: { [dayKey]: { state: 'published', itemId: 'today' } },
    preparation: { token: 'lease', leaseUntil: Date.now() + 360000 } });
  const reservation = { requestId: 'tv-test-20260912', dayKey, topicHint: 'The Gentlemen', directiveHint: 'Researchanmeldelse', articleFormat: 'research-review' };
  state.rows.set(`livExplicitPreparations/${runId}`, { input: reservation, inputHash: cmsFieldHash(reservation) });
  state.rows.set(runPath, { dayKey, explicitPreparationInputHash: cmsFieldHash(reservation), status: 'processing', continuationReady: true,
    articleCheckpoint: structuredClone(article), articleCheckpointHash: input.expectedArticleHash, preparationAttempts: 2,
    gateResults: { factcheck: { complete: false, articleHash: 'old-evidence' } } });
  state.rows.set('livDailyArticles/prepare-2026-09-13', { topic: 'Oasis', preparedMedia: ['paid', 'paid', 'paid'] });
});
afterEach(() => { expect(state.provider).not.toHaveBeenCalled(); vi.useRealTimers(); vi.unstubAllEnvs(); });

it('saves only the exact checkpoint edit and immutable before/after receipt, preserving paid provenance and gates', async () => {
  const before = structuredClone([...state.rows]);
  const response = await POST(request());
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  const revised = { ...article, content: article.content.replace('selvmodig', 'selvskabt') };
  const receipt = await response.json();
  expect(receipt).toEqual({ status: 'edited', runId, requestId: input.requestId, articleHash: livImageArticleHash(revised) });
  expect(state.rows.get(runPath).articleCheckpoint).toEqual(revised);
  expect(state.rows.get(`${runPath}/editorialEdits/${input.requestId}`)).toMatchObject({ input, inputHash: cmsFieldHash(input),
    previousArticle: article, article: revised, previousArticleHash: input.expectedArticleHash,
    articleHash: receipt.articleHash, authority: 'authorized-operator' });
  for (const [path, row] of before) {
    if (path !== runPath) expect(state.rows.get(path)).toEqual(row);
    else for (const [key, value] of Object.entries(row)) if (!['articleCheckpoint', 'articleCheckpointHash'].includes(key)) expect(state.rows.get(path)[key]).toEqual(value);
  }
  expect(state.release).toHaveBeenCalledExactlyOnceWith('lease');
});

it('replays without writes, including after workflow advancement; rejects a changed request under the same ID', async () => {
  await POST(request()); state.rows.get(runPath).webflowItemId = 'later-cms';
  const before = structuredClone([...state.rows]); state.writes.mockClear();
  expect(await (await POST(request())).json()).toMatchObject({ status: 'already_edited' });
  expect((await POST(request({ ...input, reason: 'Different reason' }))).status).toBe(409);
  expect(state.writes).not.toHaveBeenCalled(); expect([...state.rows]).toEqual(before);
});

it('serializes identical concurrent edits to one write and conflicting edits to one winner', async () => {
  const results = await Promise.all([editLivEditorialCheckpoint(input, 'lease'), editLivEditorialCheckpoint(input, 'lease')]);
  expect(results.map(result => result.status)).toEqual(['edited', 'already_edited']);
  expect(state.writes).toHaveBeenCalledTimes(2);
  await expect(editLivEditorialCheckpoint({ ...input, requestId: 'competing-edit' }, 'lease')).rejects.toThrow('liv_edit_conflict');
});

it.each(['title', 'subtitle', 'intro', 'excerpt', 'seoTitle', 'seoDescription'])('accepts an exact %s copyedit without changing other fields', async field => {
  const before = article[field as keyof typeof article] as string;
  expect((await POST(request({ ...input, patches: [{ field, before, after: `${before} Mere.` }] }))).status).toBe(200);
  expect(state.rows.get(runPath).articleCheckpoint).toEqual({ ...article, [field]: `${before} Mere.` });
});

it.each([{ status: 'failed' }, { status: 'skipped_factcheck' }, { status: 'draft' }, { status: 'published' },
  { continuationReady: false }, { retryAuthorization: 'grant' }, { webflowItemId: 'cms' }, { preparationProof: {} },
  { cmsSaveStarted: true }, { articleCheckpoint: null }, { articleCheckpointHash: 'stale' }])('rejects terminal/active/uncertain work: %j', async patch => {
  Object.assign(state.rows.get(runPath), patch); const before = structuredClone([...state.rows]);
  expect((await POST(request())).status).toBe(409); expect([...state.rows]).toEqual(before); expect(state.writes).not.toHaveBeenCalled();
});

it.each([{ preparedMedia: [] }, { preparedMedia: [{ role: 'hero' }] }, { selectedImage: { url: 'paid' } },
  { content: `${article.content}<figure>paid</figure>` }, { content: `${article.content}<img src="paid">` }])('blocks already attached media: %j', async patch => {
  Object.assign(state.rows.get(runPath).articleCheckpoint, patch);
  expect((await POST(request())).status).toBe(409); expect(state.writes).not.toHaveBeenCalled();
});

it.each(['processing', 'failed', 'complete', 'not_started'])('blocks a relevant %s media job even without attached media', async status => {
  state.rows.set('livMediaJobs/any-existing-id', { articleInputHash: input.expectedArticleHash, status });
  expect((await POST(request())).status).toBe(409); expect(state.writes).not.toHaveBeenCalled();
});
it('does not block unrelated paid media', async () => {
  state.rows.set('livMediaJobs/oasis', { articleInputHash: 'other', status: 'complete' });
  expect((await POST(request())).status).toBe(200);
});

it.each(['missing', 'wrong-day', 'tampered-input', 'wrong-binding', 'wrong-run-day', 'changed-checkpoint', 'expired', 'wrong-token', 'attempted', 'cover'])('fails closed on %s', async kind => {
  const saved = state.rows.get(`livExplicitPreparations/${runId}`), row = state.rows.get(runPath), manifest = state.rows.get('livDelivery/manifest');
  if (kind === 'missing') state.rows.delete(`livExplicitPreparations/${runId}`);
  if (kind === 'wrong-day') { saved.input.dayKey = '2026-09-13'; saved.inputHash = cmsFieldHash(saved.input); row.explicitPreparationInputHash = saved.inputHash; }
  if (kind === 'tampered-input') saved.input.topicHint = 'other';
  if (kind === 'wrong-binding') row.explicitPreparationInputHash = 'other';
  if (kind === 'wrong-run-day') row.dayKey = '2026-09-13';
  if (kind === 'changed-checkpoint') row.articleCheckpoint.content += ' changed';
  if (kind === 'expired') manifest.preparation.leaseUntil = Date.now();
  if (kind === 'wrong-token') manifest.preparation.token = 'other';
  if (kind === 'attempted') manifest.slots[dayKey].state = 'attempted';
  if (kind === 'cover') manifest.coverRevision = {};
  expect((await POST(request())).status).toBe(409); expect(state.writes).not.toHaveBeenCalled();
});

it.each(['auth', 'disabled', 'paused', 'busy', 'store'])('rejects %s safely', async kind => {
  if (kind === 'auth') state.auth.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  if (kind === 'disabled') vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'false');
  if (kind === 'paused') vi.stubEnv('LIV_DAILY_PAUSED', 'TRUE');
  if (kind === 'busy') state.claim.mockResolvedValue(null);
  if (kind === 'store') state.available = false;
  expect((await POST(request())).status).toBe(kind === 'auth' ? 403 : kind === 'store' ? 503 : 409);
  expect(state.writes).not.toHaveBeenCalled();
  expect(state.release).toHaveBeenCalledTimes(kind === 'store' ? 1 : 0);
});

it.each([{ scope: 'daily' }, { scope: 'prepare' }, { dayKey: '2026-09-13' }, { dayKey: '2026-09-11' },
  { requestId: '../secret' }, { expectedArticleHash: 'not-a-hash' }, { reason: '' }, { rating: 5 },
  { patches: [] }, { patches: [{ field: 'rating', before: '4', after: '5' }] },
  { patches: [{ field: 'content', before: 'selvmodig', after: 'selvskabt', extra: true }] }])('rejects invalid request before lease: %j', async patch => {
  expect((await POST(request({ ...input, ...patch }))).status).toBe(400); expect(state.claim).not.toHaveBeenCalled();
});
it.each([{ before: 'not in article', after: 'new' }, { before: 'selvmodig', after: 'selvmodig' },
  { before: 'selvmodig', after: '<b>selvskabt</b>' }, { before: 'selvmodig', after: 'https://bad.example' },
  { before: 'selvmodig', after: 'x'.repeat(500) }])('uses real exact-patch structural/scope validation: %j', async patch => {
  expect((await POST(request({ ...input, patches: [{ field: 'content', ...patch }] }))).status).toBe(400);
  expect(state.writes).not.toHaveBeenCalled(); expect(state.release).toHaveBeenCalledWith('lease');
});
it('rejects malformed/oversize/query requests and sanitizes unknown errors', async () => {
  expect((await POST(request(input, '?scope=daily'))).status).toBe(400);
  expect((await POST(new NextRequest('https://app.example/api/liv/operations/edit', { method: 'POST', body: '{' }))).status).toBe(400);
  expect((await POST(request({ ...input, reason: 'x'.repeat(45001) }))).status).toBe(400);
  expect(state.claim).not.toHaveBeenCalled();
  state.claim.mockRejectedValue(new Error('upstream secret token'));
  expect(await (await POST(request())).json()).toEqual({ error: 'liv_edit_failed' });
});
