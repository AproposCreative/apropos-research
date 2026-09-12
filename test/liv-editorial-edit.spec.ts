import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
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
      const result = await run({ get: async (ref: any) => {
        if (writes.length) throw new Error('transaction read after write');
        if (!ref.field) return { data: () => state.rows.get(ref.path) };
        const docs = [...state.rows].filter(([path, row]) => path.startsWith(`${ref.path}/`) && row[ref.field] === ref.value)
          .map(([path, row]) => ({ id: path.split('/').at(-1), data: () => row }));
        return { empty: docs.length === 0, size: docs.length, docs };
      },
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
import { insertLivBodyMedia, type MediaEvidence } from '@/lib/liv/automatic-media';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { applyLivMediaDescriptionCorrections } from '@/lib/liv/media-description-repair';

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

it.each([{ scope: 'daily' }, { scope: 'prepare-alternative' }, { dayKey: '2026-09-13' }, { dayKey: '2026-09-11' },
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

function scheduledFixture(day = '2026-09-15') {
  const path = `livDailyArticles/prepare-${day}`, planPath = `livDailyPlan/plan-${day}`;
  state.rows.get('livDelivery/manifest').slots = {};
  state.rows.set(path, { ...structuredClone(state.rows.get(runPath)), dayKey: day, explicitPreparationInputHash: undefined });
  state.rows.set(planPath, { dayKey: day, status: 'pending', topicHint: 'Frankenstein', directiveHint: 'Kulturartikel', articleFormat: 'article' });
  const edit = { ...input, scope: 'prepare', dayKey: day,
    patches: [{ field: 'title', before: article.title, after: 'Frankensteins skaber og skabning' },
      { field: 'content', before: 'selvmodig', after: 'selvskabt' }] };
  return { path, planPath, edit };
}

it.each(['2026-09-12', '2026-09-15', '2026-09-19'])('edits scheduled pre-media work on %s atomically without providers or changed gates', async day => {
  const { path, planPath, edit } = scheduledFixture(day), before = structuredClone([...state.rows]);
  const priorRun = structuredClone(state.rows.get(path)), priorPlan = structuredClone(state.rows.get(planPath));
  expect((await POST(request(edit))).status).toBe(200);
  const revised = { ...article, title: edit.patches[0].after, content: article.content.replace('selvmodig', 'selvskabt') };
  expect(state.rows.get(path)).toEqual({ ...priorRun, articleCheckpoint: revised,
    articleCheckpointHash: livImageArticleHash(revised), updatedAt: expect.anything() });
  expect(state.rows.get(`${path}/editorialEdits/${edit.requestId}`)).toMatchObject({ previousRun: priorRun, previousPlan: priorPlan,
    previousArticle: article, article: revised, input: edit });
  for (const [key, value] of before) if (key !== path) expect(state.rows.get(key)).toEqual(value);
  expect(state.writes).toHaveBeenCalledTimes(2);
});

it.each(['2026-09-11', '2026-09-20'])('rejects scheduled out-of-window %s before lease and in helper', async day => {
  const { edit } = scheduledFixture(day);
  expect((await POST(request(edit))).status).toBe(400); expect(state.claim).not.toHaveBeenCalled();
  await expect(editLivEditorialCheckpoint(edit, 'lease')).rejects.toThrow('liv_edit_invalid');
  expect(state.writes).not.toHaveBeenCalled();
});

it.each(['missing-plan', 'wrong-plan-day', 'failed-plan', 'used-plan', 'wrong-run-day', 'missing-run',
  'slot', 'admitted', 'expired-lease', 'wrong-token', 'cover', 'attempted', 'checkpoint-tamper', 'hash-tamper',
  'failed', 'skipped_factcheck', 'draft', 'published', 'not-yielded', 'retry', 'cms', 'proof', 'cms-started',
  'images', 'hero', 'html-image', 'media-processing', 'media-failed', 'media-complete'])('blocks scheduled %s without writes', async kind => {
  const { path, planPath, edit } = scheduledFixture();
  const row = state.rows.get(path), plan = state.rows.get(planPath), manifest = state.rows.get('livDelivery/manifest');
  if (kind === 'missing-plan') state.rows.delete(planPath);
  if (kind === 'wrong-plan-day') plan.dayKey = dayKey;
  if (kind === 'failed-plan') plan.status = 'failed';
  if (kind === 'used-plan') plan.status = 'used';
  if (kind === 'wrong-run-day') row.dayKey = dayKey;
  if (kind === 'missing-run') state.rows.delete(path);
  if (kind === 'slot') manifest.slots[edit.dayKey] = { state: 'selected', itemId: 'other' };
  if (kind === 'admitted') manifest.entries = [{ scheduledDay: edit.dayKey, state: 'ready' }];
  if (kind === 'expired-lease') manifest.preparation.leaseUntil = Date.now();
  if (kind === 'wrong-token') manifest.preparation.token = 'other';
  if (kind === 'cover') manifest.coverRevision = {};
  if (kind === 'attempted') manifest.slots[dayKey] = { state: 'attempted' };
  if (kind === 'checkpoint-tamper') row.articleCheckpoint.content += ' changed';
  if (kind === 'hash-tamper') row.articleCheckpointHash = 'a'.repeat(64);
  if (['failed', 'skipped_factcheck', 'draft', 'published'].includes(kind)) row.status = kind;
  if (kind === 'not-yielded') row.continuationReady = false;
  if (kind === 'retry') row.retryAuthorization = 'grant';
  if (kind === 'cms') row.webflowItemId = 'cms';
  if (kind === 'proof') row.preparationProof = {};
  if (kind === 'cms-started') row.cmsSaveStarted = true;
  if (kind === 'images') row.articleCheckpoint.preparedMedia = [];
  if (kind === 'hero') row.articleCheckpoint.selectedImage = { url: 'paid' };
  if (kind === 'html-image') row.articleCheckpoint.content += '<img src="paid">';
  if (kind.startsWith('media-')) state.rows.set('livMediaJobs/paid', { articleInputHash: edit.expectedArticleHash, status: kind.slice(6) });
  const before = structuredClone([...state.rows]);
  expect((await POST(request(edit))).status).toBe(409);
  expect(state.writes).not.toHaveBeenCalled(); expect([...state.rows]).toEqual(before);
});

it('acknowledges a scheduled edit replay after admission without reapplying it; changed requests conflict', async () => {
  const { path, planPath, edit } = scheduledFixture();
  const results = await Promise.all([editLivEditorialCheckpoint(edit, 'lease'), editLivEditorialCheckpoint(edit, 'lease')]);
  expect(results.map(result => result.status)).toEqual(['edited', 'already_edited']);
  expect(state.writes).toHaveBeenCalledTimes(2);
  Object.assign(state.rows.get(path), { status: 'draft', webflowItemId: 'saved-cms', continuationReady: false });
  state.rows.get(planPath).status = 'used';
  state.rows.get('livDelivery/manifest').entries = [{ scheduledDay: edit.dayKey, itemId: 'saved-cms', state: 'ready' }];
  state.writes.mockClear(); const before = structuredClone([...state.rows]);
  expect(await (await POST(request(edit))).json()).toMatchObject({ status: 'already_edited' });
  expect((await POST(request({ ...edit, reason: 'Changed input' }))).status).toBe(409);
  expect((await POST(request({ ...edit, requestId: 'another-edit' }))).status).toBe(409);
  expect(state.writes).not.toHaveBeenCalled(); expect([...state.rows]).toEqual(before);
});

it('does not expose the legacy post-media edit capability to scheduled work', async () => {
  const { edit: mediaEdit } = preparedFixture();
  const { path, edit } = scheduledFixture();
  Object.assign(state.rows.get(path), { status: 'processing', continuationReady: true });
  expect((await POST(request({ ...mediaEdit, scope: edit.scope, dayKey: edit.dayKey }))).status).toBe(409);
  expect(state.writes).not.toHaveBeenCalled();
});

function preparedFixture(content?: string) {
  const sourceArticle = { ...structuredClone(article), section: 'Kultur', tags: [],
    subtitle: 'I anden sæson bliver forskellen mellem dem seriens skarpeste konflikt.',
    content: content || `${article.content}<p>Andet afsnit med bevaret kilde.</p><p>Tredje afsnit med kultur.</p><p>En afslutning.</p>` } as GeneratedArticle;
  const articleInputHash = livImageArticleHash(sourceArticle);
  const jobId = createHash('sha256').update(JSON.stringify(['liv-media-v1', dayKey, articleInputHash, 'photography', 'expressive'])).digest('hex');
  const media: MediaEvidence[] = (['hero', 'body-1', 'body-2'] as const).map((role, index) => ({
    role, url: `https://storage.googleapis.com/bucket/${role}.webp`, storagePath: `liv/${role}.webp`,
    contentHash: String(index + 1).repeat(64), sourceHash: String(index + 4).repeat(64), width: 1200, height: index ? 800 : 675, bytes: 40000,
    alt: `Officielt Netflix stillbillede ${index}`, caption: index === 2 ? 'Ved godsets vandkant mødes arv, ambition og familiebånd.' : 'Eddie og Susie taler sammen.',
    credit: 'Christopher Rafael / Netflix', sourceUrl: `https://netflix.com/photo-${index}.jpg`,
    sourcePageUrl: 'https://netflix.com/tudum/', kind: 'photography',
  }));
  const complete = { ...sourceArticle, content: insertLivBodyMedia(sourceArticle.content, media), preparedMedia: media };
  const hero = media[0];
  const selectedImage = { id: `${jobId}-hero`, articleHash: livImageArticleHash(complete), url: hero.url,
    storagePath: hero.storagePath, sourceUrl: hero.sourceUrl!, sourcePageUrl: hero.sourcePageUrl, contentHash: hero.contentHash,
    sourceHash: hero.sourceHash, width: 1200 as const, height: 675 as const, bytes: hero.bytes, alt: hero.alt, credit: hero.credit,
    createdAt: '2026-09-12T10:00:00Z', rightsStatus: 'unverified' as const, visualReview: 'automated' as const };
  const checkpoint = { ...complete, selectedImage };
  state.rows.set(`livMediaJobs/${jobId}`, { status: 'complete', articleInputHash, article: structuredClone(checkpoint), mode: 'photography', style: 'expressive' });
  for (const image of media) state.rows.set(`livMediaJobs/${jobId}/stages/${image.role}`, { evidence: structuredClone(image) });
  state.rows.set(`livMediaJobs/${jobId}/stages/visual-review`, { status: 'complete', result: { pass: true }, usage: { paid: true } });
  Object.assign(state.rows.get(runPath), { status: 'skipped_factcheck', continuationReady: false,
    articleCheckpoint: checkpoint, articleCheckpointHash: livImageArticleHash(checkpoint) });
  const edit = { ...input, expectedArticleHash: livImageArticleHash(checkpoint), expectedCheckpointHash: cmsFieldHash(checkpoint),
    patches: [{ field: 'subtitle', before: sourceArticle.subtitle, after: 'For mig er forskellen mellem dem anden sæsons skarpeste konflikt.' }],
    mediaCaptions: [{ role: 'body-2', before: media[2].caption, after: 'Ved vandkanten mødes arv, ambition og familiebånd.' }] };
  return { checkpoint, jobId, edit };
}

it('atomically copyedits failed prepared subtitle + caption, preserving all paid assets, rendered credits, positions, gates and status', async () => {
  const { checkpoint, jobId, edit } = preparedFixture(); const before = structuredClone([...state.rows]);
  const result = await POST(request(edit)); expect(result.status).toBe(200);
  const revised = state.rows.get(runPath).articleCheckpoint;
  expect(revised.content).toBe(checkpoint.content.replace(edit.mediaCaptions[0].before, edit.mediaCaptions[0].after));
  expect(revised.subtitle).toBe(edit.patches[0].after);
  expect(revised.preparedMedia).toEqual(checkpoint.preparedMedia.map(image => image.role === 'body-2' ? { ...image, caption: edit.mediaCaptions[0].after } : image));
  expect(revised.selectedImage).toEqual({ ...checkpoint.selectedImage, articleHash: livImageArticleHash(revised) });
  expect(state.rows.get(runPath).articleCheckpointHash).toBe(livImageArticleHash(revised));
  for (const [key, value] of Object.entries(checkpoint)) if (!['content', 'subtitle', 'preparedMedia', 'selectedImage'].includes(key)) expect(revised[key]).toEqual(value);
  for (const [path, row] of before) {
    if (path !== runPath) expect(state.rows.get(path)).toEqual(row);
    else for (const [key, value] of Object.entries(row)) if (!['articleCheckpoint', 'articleCheckpointHash'].includes(key)) expect(state.rows.get(path)[key]).toEqual(value);
  }
  expect(state.rows.get(`${runPath}/editorialEdits/${edit.requestId}`)).toMatchObject({ mediaJobId: jobId,
    previousArticle: checkpoint, article: revised, previousCheckpointHash: edit.expectedCheckpointHash, checkpointHash: cmsFieldHash(revised) });
  state.writes.mockClear(); expect(await (await POST(request(edit))).json()).toMatchObject({ status: 'already_edited' });
  expect(state.writes).not.toHaveBeenCalled();
});

it.each(['failed', 'skipped_factcheck', 'skipped_moderation', 'skipped_tov'])('permits failed %s media checkpoints without authorizing retry', async status => {
  const { edit } = preparedFixture(); state.rows.get(runPath).status = status;
  expect((await POST(request(edit))).status).toBe(200);
  expect(state.rows.get(runPath)).toMatchObject({ status, continuationReady: false });
  expect(state.rows.get(runPath)).not.toHaveProperty('retryAuthorization');
});

it.each(['subtitle-only', 'caption-only'])('permits %s while preserving all unrelated text', async kind => {
  const { edit } = preparedFixture();
  expect((await POST(request(kind === 'subtitle-only' ? { ...edit, mediaCaptions: undefined } : { ...edit, patches: [] }))).status).toBe(200);
});

it.each(['processing', 'failed-job', 'missing-job', 'changed-job-article', 'stage-missing', 'stage-changed', 'visual-ambiguous',
  'sibling-job', 'newer-job', 'wrong-day-job', 'stale-whole-hash', 'stale-selected-hash', 'incomplete-media', 'credit-mismatch',
  'caption-mismatch', 'duplicate-role', 'body-patch', 'retry-grant', 'cms', 'proof', 'cms-started', 'continuation'])('rejects uncertain/tampered post-media work: %s', async kind => {
  const { jobId, edit } = preparedFixture(), row = state.rows.get(runPath), job = state.rows.get(`livMediaJobs/${jobId}`);
  if (kind === 'processing') row.status = 'processing';
  if (kind === 'failed-job') job.status = 'failed';
  if (kind === 'missing-job') state.rows.delete(`livMediaJobs/${jobId}`);
  if (kind === 'changed-job-article') job.article.rawResponse += 'tampered';
  if (kind === 'stage-missing') state.rows.delete(`livMediaJobs/${jobId}/stages/body-2`);
  if (kind === 'stage-changed') state.rows.get(`livMediaJobs/${jobId}/stages/body-2`).evidence.credit = 'other';
  if (kind === 'visual-ambiguous') state.rows.get(`livMediaJobs/${jobId}/stages/visual-review`).status = 'processing';
  if (kind === 'sibling-job') state.rows.set('livMediaJobs/other', { articleInputHash: job.articleInputHash, status: 'processing' });
  if (kind === 'newer-job') state.rows.set('livMediaJobs/other', { articleInputHash: edit.expectedArticleHash, status: 'failed' });
  if (kind === 'wrong-day-job') job.style = 'minimal';
  if (kind === 'stale-whole-hash') edit.expectedCheckpointHash = 'a'.repeat(64);
  if (kind === 'stale-selected-hash') row.articleCheckpoint.selectedImage.articleHash = 'b'.repeat(64);
  if (kind === 'incomplete-media') row.articleCheckpoint.preparedMedia.pop();
  if (kind === 'credit-mismatch') row.articleCheckpoint.preparedMedia[2].credit = 'Other';
  if (kind === 'caption-mismatch') edit.mediaCaptions[0].before = 'En anden billedtekst.';
  if (kind === 'duplicate-role') edit.mediaCaptions.push({ ...edit.mediaCaptions[0] });
  if (kind === 'body-patch') edit.patches = [{ field: 'content', before: 'selvmodig', after: 'selvskabt' }];
  if (kind === 'retry-grant') row.retryAuthorization = 'grant';
  if (kind === 'cms') row.webflowItemId = 'saved';
  if (kind === 'proof') row.preparationProof = {};
  if (kind === 'cms-started') row.cmsSaveStarted = true;
  if (kind === 'continuation') row.continuationReady = true;
  const before = structuredClone([...state.rows]);
  expect([400, 409]).toContain((await POST(request(edit))).status);
  expect(state.writes).not.toHaveBeenCalled(); expect([...state.rows]).toEqual(before);
});

it.each([{ role: 'hero' }, { after: '<b>Ny billedtekst</b>' }, { after: 'https://other.example' },
  { credit: 'Changed' }, { url: 'https://other.example' }])('rejects caption schema bypasses: %j', async patch => {
  const { edit } = preparedFixture();
  expect((await POST(request({ ...edit, mediaCaptions: [{ ...edit.mediaCaptions[0], ...patch }] }))).status).toBe(400);
  expect(state.writes).not.toHaveBeenCalled();
});

it('serializes concurrent post-media edits to one audited change', async () => {
  const { edit } = preparedFixture();
  const results = await Promise.all([editLivEditorialCheckpoint(edit, 'lease'), editLivEditorialCheckpoint(edit, 'lease')]);
  expect(results.map(result => result.status)).toEqual(['edited', 'already_edited']); expect(state.writes).toHaveBeenCalledTimes(2);
});

function revisedFixture(count = 1, content?: string) {
  const fixture = preparedFixture(content);
  let previous: GeneratedArticle = fixture.checkpoint;
  for (let index = 1; index <= count; index++) {
    const revisionId = String(index + 6).repeat(64);
    const revised = applyLivMediaDescriptionCorrections({ ...previous, subtitle: fixture.checkpoint.subtitle }, { corrections: [{
      role: 'body-2', alt: `Eddie og Susie står ved vandkanten, version ${index}.`,
      caption: index === count ? 'Ved godsets vandkant mødes arv, ambition og familiebånd.' : `Eddie og Susie ser mod vandet, version ${index}.`,
    }] });
    revised.factRevisionId = revisionId; revised.factRevisionCount = index;
    revised.selectedImage = { ...revised.selectedImage!, articleHash: livImageArticleHash(revised) };
    state.rows.set(`livFactRevisions/${revisionId}`, { status: 'complete', previous: structuredClone(previous),
      article: structuredClone(revised), visualReview: { pass: false }, descriptionReview: { pass: true, articleHash: livImageArticleHash(revised) },
      rawResponse: 'paid patch', descriptionCorrectionUsage: { paid: true } });
    previous = revised;
  }
  Object.assign(state.rows.get(runPath), { articleCheckpoint: previous, articleCheckpointHash: livImageArticleHash(previous) });
  fixture.edit.expectedArticleHash = livImageArticleHash(previous);
  fixture.edit.expectedCheckpointHash = cmsFieldHash(previous as unknown as Record<string, unknown>);
  fixture.edit.mediaCaptions[0].after = 'Arv og ambition er en sprængfarlig familieforretning.';
  return { ...fixture, revised: previous };
}

it.each([1, 2])('accepts an exact %i-completed-revision chain with changed captions/alts but identical pixels and provenance', async count => {
  const { edit, jobId, revised } = revisedFixture(count); const before = structuredClone([...state.rows]);
  expect((await POST(request(edit))).status).toBe(200);
  const result = state.rows.get(runPath).articleCheckpoint;
  expect(result.content).toBe(revised.content.replace(edit.mediaCaptions[0].before, edit.mediaCaptions[0].after));
  expect(result.preparedMedia).toEqual(revised.preparedMedia!.map(image => image.role === 'body-2' ? { ...image, caption: edit.mediaCaptions[0].after } : image));
  expect(result.selectedImage).toEqual({ ...revised.selectedImage, articleHash: livImageArticleHash(result) });
  expect(result.factRevisionId).toBe(revised.factRevisionId); expect(result.factRevisionCount).toBe(count);
  for (const [path, row] of before) if (path !== runPath) expect(state.rows.get(path)).toEqual(row);
  expect(state.rows.get(`${runPath}/editorialEdits/${edit.requestId}`).mediaRevisionIds).toHaveLength(count);
  expect(state.rows.get(`livMediaJobs/${jobId}`).article).not.toEqual(revised);
});

function scheduledMediaFixture() {
  const content = '<p>giver han den sammensatte krop liv ser på resultatet. Romanens undertitel, Jeg læser undertitlen som en advarsel.</p>' +
    '<p>Arrangementet fandt sted 3. september på Glyptoteket.</p>' +
    `<p>${'En selvstændig betragtning om kultur og ansvar. '.repeat(20)}</p>`;
  const fixture = revisedFixture(1, content);
  const scheduled = scheduledFixture(dayKey);
  state.rows.get(scheduled.planPath).status = 'failed';
  const edit = { ...scheduled.edit, expectedArticleHash: livImageArticleHash(fixture.revised),
    expectedCheckpointHash: cmsFieldHash(fixture.revised as unknown as Record<string, unknown>), patches: [
      { field: 'content', before: 'giver han den sammensatte krop liv ser på resultatet', after: 'giver han den sammensatte krop liv, ser på resultatet' },
      { field: 'content', before: 'Romanens undertitel, Jeg læser undertitlen', after: 'Jeg læser undertitlen' },
      { field: 'content', before: 'fandt sted 3. september på Glyptoteket', after: 'var annonceret til 3. september på Glyptoteket' },
    ] };
  return { ...scheduled, ...fixture, edit };
}

it('audits three exact scheduled content patches after factual revision, keeping paid pixels and old visual binding pending', async () => {
  const { path, planPath, revised: original, edit } = scheduledMediaFixture();
  const before = structuredClone([...state.rows]);
  expect((await POST(request(edit))).status).toBe(200);
  const changed = state.rows.get(path).articleCheckpoint;
  expect(changed.content).toContain('liv, ser på resultatet');
  expect(changed.content).not.toContain('Romanens undertitel,');
  expect(changed.content).toContain('var annonceret til 3. september');
  expect(changed.content.match(/<figure[\s\S]*?<\/figure>/g)).toEqual(original.content.match(/<figure[\s\S]*?<\/figure>/g));
  expect(changed.preparedMedia).toEqual(original.preparedMedia);
  expect(changed.selectedImage).toEqual({ ...original.selectedImage, visualReview: 'pending',
    editorialEdit: { runId: `prepare-${dayKey}`, requestId: edit.requestId } });
  expect(changed.selectedImage.articleHash).not.toBe(livImageArticleHash(changed));
  expect(changed.rawResponse).toBe(original.rawResponse); expect(changed.factRevisionId).toBe(original.factRevisionId);
  expect(changed.factRevisionCount).toBe(1); expect(state.rows.get(planPath).status).toBe('failed');
  expect(state.rows.get(path)).toMatchObject({ status: 'skipped_factcheck', continuationReady: false });
  for (const [key, value] of before) if (key !== path) expect(state.rows.get(key)).toEqual(value);
  state.writes.mockClear(); expect(await (await POST(request(edit))).json()).toMatchObject({ status: 'already_edited' });
  expect(state.writes).not.toHaveBeenCalled();
});

it('allows an audited correction at a yielded scheduled media checkpoint without granting retries or changing pixels', async () => {
  const { path, planPath, edit, revised } = scheduledMediaFixture();
  Object.assign(state.rows.get(path), { status: 'processing', continuationReady: true });
  state.rows.get(planPath).status = 'pending';
  expect((await POST(request(edit))).status).toBe(200);
  expect(state.rows.get(path)).toMatchObject({status:'processing',continuationReady:true});
  expect(state.rows.get(path).retryAuthorization).toBeUndefined();
  expect(state.rows.get(path).articleCheckpoint.preparedMedia).toEqual(revised.preparedMedia);
  expect(state.rows.get(path).articleCheckpoint.selectedImage.visualReview).toBe('pending');
});

it.each(['pending-plan', 'wrong-day-plan', 'active', 'retry', 'cms', 'title', 'caption', 'figure-text', 'tampered-lineage', 'second-edit'])('blocks unsafe scheduled post-media edit: %s', async kind => {
  const { path, planPath, edit, revised } = scheduledMediaFixture();
  if (kind === 'pending-plan') state.rows.get(planPath).status = 'pending';
  if (kind === 'wrong-day-plan') state.rows.get(planPath).dayKey = '2026-09-13';
  if (kind === 'active') state.rows.get(path).status = 'processing';
  if (kind === 'retry') state.rows.get(path).retryAuthorization = 'grant';
  if (kind === 'cms') state.rows.get(path).webflowItemId = 'cms';
  if (kind === 'title') edit.patches[0].field = 'title';
  if (kind === 'caption') Object.assign(edit, { mediaCaptions: [{ role: 'body-2', before: revised.preparedMedia![2].caption, after: 'Ny billedtekst ved vandet.' }] });
  if (kind === 'figure-text') edit.patches = [{ field: 'content', before: revised.preparedMedia![2].caption, after: 'Ny billedtekst ved vandet.' }];
  if (kind === 'tampered-lineage') state.rows.get(`livFactRevisions/${revised.factRevisionId}`).status = 'processing';
  if (kind === 'second-edit') {
    await POST(request(edit)); edit.requestId = 'another-edit';
    edit.expectedArticleHash = state.rows.get(path).articleCheckpointHash;
    edit.expectedCheckpointHash = cmsFieldHash(state.rows.get(path).articleCheckpoint); state.writes.mockClear();
  }
  const before = structuredClone([...state.rows]);
  expect([400, 409]).toContain((await POST(request(edit))).status);
  expect(state.writes).not.toHaveBeenCalled(); expect([...state.rows]).toEqual(before);
});

it.each(['missing', 'processing', 'wrong-current', 'wrong-previous', 'wrong-count', 'failed-visual', 'stale-visual', 'changed-pixels',
  'changed-credit', 'changed-hero', 'third-link'])('rejects unproved revision chain: %s', async kind => {
  const { edit, revised } = revisedFixture(kind === 'third-link' ? 3 : 1);
  const path = `livFactRevisions/${revised.factRevisionId}`, revision = state.rows.get(path);
  if (kind === 'missing') state.rows.delete(path);
  if (kind === 'processing') revision.status = 'processing';
  if (kind === 'wrong-current') revision.article.subtitle += 'other';
  if (kind === 'wrong-previous') revision.previous.rawResponse += 'tampered';
  if (kind === 'wrong-count') revision.previous.factRevisionCount = 4;
  if (kind === 'failed-visual') revision.descriptionReview.pass = false;
  if (kind === 'stale-visual') revision.descriptionReview.articleHash = '0'.repeat(64);
  if (['changed-pixels', 'changed-credit', 'changed-hero'].includes(kind)) {
    // Even an otherwise matching completed receipt may not authorize new assets.
    if (kind === 'changed-pixels') revised.preparedMedia![2].contentHash = 'c'.repeat(64);
    if (kind === 'changed-credit') revised.preparedMedia![2].credit = 'Other rightsholder';
    if (kind === 'changed-hero') revised.selectedImage!.url = 'https://storage.googleapis.com/other.webp';
    revision.article = structuredClone(revised); edit.expectedCheckpointHash = cmsFieldHash(revised as unknown as Record<string, unknown>);
  }
  const before = structuredClone([...state.rows]);
  expect((await POST(request(edit))).status).toBe(409); expect(state.writes).not.toHaveBeenCalled(); expect([...state.rows]).toEqual(before);
});
