import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { articleFingerprint } from '@/lib/factcheck/grounded';
import { checkLivArticleLength } from '@/lib/liv/article-length';
const repair = vi.hoisted(() => vi.fn());
const resumeFacts = vi.hoisted(() => vi.fn());
const plans = vi.hoisted(() => ({ saved: null as any, failed: vi.fn(), generate: vi.fn(), qa: vi.fn() }));
vi.mock('@/lib/liv/fact-revision', () => ({ repairLivArticleFacts: repair, resumeLivFactRevision: resumeFacts }));
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), supplement: vi.fn(), topic: vi.fn(), publish: vi.fn(), live: vi.fn(), finish: vi.fn(), gates: vi.fn(), claim: vi.fn(), readback: vi.fn(), analytics: vi.fn(), media: vi.fn(), checkpoint: vi.fn(), admission: vi.fn(), proof: vi.fn(), yield: vi.fn(), row: undefined as any, doc: vi.fn() }));
vi.mock('@/lib/liv/supplement-research', () => ({ supplementLivResearch: mocks.supplement, refreshLivResearchDates: mocks.refresh }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: mocks.doc }) }) }));
vi.mock('@/lib/liv/prepared-admission', () => ({ admitPreparedArticle: mocks.admission }));
vi.mock('@/lib/liv/automatic-media', () => ({ prepareLivAutomaticMedia: mocks.media }));
vi.mock('@/lib/liv/publish-verified', () => ({ publishVerifiedLivArticle: mocks.live }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: () => null }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/liv/daily-history-store', () => ({ claimLivDaily: mocks.claim, finishLivDaily: mocks.finish,
  checkpointLivDailyCmsItem: vi.fn(), checkpointLivDailyArticle: mocks.checkpoint, checkpointPreparationProof: mocks.proof, todayDayKeyUTC: () => '2026-09-09',
  livDailyDocId: (day: string, scope: string) => `${scope}-${day}`, yieldLivPreparation: mocks.yield }));
vi.mock('@/lib/liv/pick-topic', () => ({ pickLivTopic: mocks.topic }));
vi.mock('@/lib/liv/generate-article', () => ({ generateLivArticle: async (options: unknown) => {
  plans.generate(options);
  return { title: 'Et museum åbner', subtitle: 'En ny udstilling', intro: 'Intro', content: 'Kultur '.repeat(550), slug: 'et-museum-aabner', excerpt: 'Udstilling', section: 'Kunst', seoTitle: 'Museum', seoDescription: 'Udstilling', researchSources: [{ url: 'https://museum.dk/news', source: 'Museum' }, { url: 'https://kultur.dk/news', source: 'Kultur' }] };
} }));
vi.mock('@/lib/liv/build-cms-payload', () => ({ buildLivCmsPayload: () => ({ title: 'Et museum åbner' }) }));
vi.mock('@/lib/liv/run-safety-gates', () => ({ runSafetyGates: mocks.gates }));
vi.mock('@/lib/liv/research-qa', () => ({ buildResearchQaSummary: (input: unknown) => {
  plans.qa(input); return { canAutoPublish: true, blockers: [] };
} }));
vi.mock('@/lib/articles/publish', () => ({ publishArticleDraftToWebflow: mocks.publish }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: mocks.readback }));
vi.mock('@/lib/newsletter/ga4-measurement', () => ({ sendGa4MeasurementEvent: mocks.analytics }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ getLivDailyPlan: async () => plans.saved, markPlanFailed: plans.failed, markPlanUsed: async () => {} }));
vi.mock('@/lib/liv/resolve-liv-topic-hints', () => ({ resolveLivTopicInputsFromPlan: (plan: any) => ({ topicHint: plan?.topicHint, mustUseTrending: plan?.mustUseTrending }) }));
import { GET } from '@/app/api/cron/liv-daily-article/route';
import { ArticleSaveError } from '@/lib/articles/save-receipt';
import { runLivDaily } from '@/lib/liv/run-daily';
import { SourceSimilarityError } from '@/lib/liv/source-similarity-error';
import { defaultEditorialPlan, editorialPlanHash } from '@/lib/liv/rolling-plan';

const saveResult = { articleId: 'saved-item', publicationVerified: false,
  receipt: { saveState: 'draft', saveVerified: true, cmsLocaleId: 'locale' } };

it.each([true, false, undefined])('passes originality permission only from an explicitly flagged saved reserve row: %s', async flag => {
  mocks.row = { topic: 'Saved TV review', resumeWritingRunId: '22f6a890-794f-4041-84da-5ce28b5336d9', allowOriginalityRevision: flag };
  await runLivDaily(new NextRequest('http://localhost/api/liv/operations/retry', { method: 'POST',
    body: JSON.stringify({ allowOriginalityRevision: true }) }), {
    dayKey: '2026-09-12', kind: 'reserve', scope: 'reserve-editorial', defaultPlan: defaultEditorialPlan('2026-09-12', true) });
  const options = plans.generate.mock.calls[0][0];
  if (flag === true) expect(options.allowOriginalityRevision).toBe(true);
  else expect(options).not.toHaveProperty('allowOriginalityRevision');
  expect(options.resumeWritingRunId).toBe(mocks.row.resumeWritingRunId);
});

it('does not extend a saved edit flag to other scopes', async () => {
  mocks.row = { topic: 'Saved', resumeWritingRunId: '22f6a890-794f-4041-84da-5ce28b5336d9', allowOriginalityRevision: true };
  await runLivDaily(new NextRequest('http://localhost/api/liv/operations/retry'), {
    dayKey: '2026-09-12', kind: 'reserve', defaultPlan: defaultEditorialPlan('2026-09-12', true) });
  expect(plans.generate.mock.calls[0][0]).not.toHaveProperty('allowOriginalityRevision');
});

it.each([true, false])('persists actual failed similarity diagnostics before checkpoint, complete=%s', async complete => {
  const scores = { embeddingSim: 0.892823, ngramJaccard: 0, openingSim: 0.07258, copiedPassage: false };
  const error = new SourceSimilarityError({ pass: false, complete, scores, reason: 'private provider reason',
    failure: complete ? 'similarity-exceeded' : 'embedding-unavailable', method: 'word-5gram-v2' },
  { url: 'https://soundvenue.com/film?token=private-token', contentHash: 'a'.repeat(64) },
  { text: 'Private paid article', model: 'fixture', voiceVersion: 'liv-v4' });
  plans.generate.mockImplementation(() => { throw error; });
  const response = await runLivDaily(new NextRequest('http://localhost/api/liv/operations/retry'), {
    dayKey: '2026-09-12', kind: 'reserve', scope: 'reserve-editorial', defaultPlan: defaultEditorialPlan('2026-09-12', true) });
  expect(response.status).toBe(complete ? 422 : 503);
  const body = await response.json();
  expect(body).toMatchObject({ code: complete ? 'source_similarity_unapproved' : 'source_similarity_incomplete',
    diagnostic: { sourceHost: 'soundvenue.com', sourceHash: 'a'.repeat(64), complete, scores } });
  const gate = mocks.finish.mock.calls[0][1].gateResults[0];
  expect(gate).toMatchObject({ name: 'source-similarity', pass: false });
  expect(JSON.parse(gate.detail)).toEqual(body.diagnostic);
  expect(gate).not.toHaveProperty('evidence');
  expect(JSON.stringify([body, mocks.finish.mock.calls])).not.toMatch(/private-token|private provider|Private paid/);
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-12', expect.objectContaining({ status: 'failed' }), 'reserve-editorial');
  expect(mocks.checkpoint).not.toHaveBeenCalled(); expect(mocks.media).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.live).not.toHaveBeenCalled();
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.row = undefined;
  plans.saved = null;
  mocks.doc.mockImplementation(() => ({ get: async () => ({ data: () => mocks.row }) }));
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'auto_publish');
  vi.stubEnv('LIV_DAILY_PAUSED', '0');
  mocks.claim.mockResolvedValue({ ok: true });
  mocks.topic.mockResolvedValue({ title: 'Et museum åbner', source: { url: 'https://museum.dk/news' } });
  mocks.media.mockImplementation(async article => article);
  mocks.refresh.mockImplementation(async article => article);
  mocks.gates.mockResolvedValue({ pass: true, results: [] });
  mocks.publish.mockResolvedValue(saveResult);
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: false, checks: [{ id: 'image:rights', ok: false }] });
  mocks.live.mockResolvedValue({ publicationVerified: true, publicUrl: 'https://www.aproposmagazine.com/articles/et-museum-aabner' });
});
afterEach(() => vi.unstubAllEnvs());
it('surfaces research failure without generating media or pretending the day had no topic', async () => {
  vi.stubEnv('VERCEL_ENV', 'production');
  mocks.topic.mockRejectedValue(new Error('liv_trending_http_401'));
  const response = await GET(new NextRequest('https://protected.vercel.app/api/cron/liv-daily-article'));
  expect(response.status).toBe(500);
  expect(mocks.topic).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://ai.aproposmagazine.com' }));
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'failed', reason: 'liv_trending_http_401' }));
  expect(mocks.media).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});
it('returns JSON for a failed dry-run without claiming or writing history', async () => {
  mocks.topic.mockRejectedValue(new Error('liv_trending_http_401'));
  const response = await GET(new NextRequest('http://localhost/api/cron/liv-daily-article?dryRun=1'));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, dryRun: true, error: 'liv_trending_http_401' });
  expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.finish).not.toHaveBeenCalled();
});
it('keeps researched auto-mode articles as drafts while image/CMS checks are missing', async () => {
  const response = await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'));
  const result = await response.json();
  expect(result.publicationBlocked).toBe(true);
  expect(result.webflowStatus).toBe('draft');
  expect(result.publicationMode).toBe('auto_publish');
  expect(result.gateResults).toContainEqual(expect.objectContaining({ name: 'cms-publication', pass: false }));
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'draft' }));
  expect(mocks.live).not.toHaveBeenCalled();
});
it('automatically publishes only after structure and CMS checks pass', async () => {
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }] });
  const result = await (await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'))).json();
  expect(mocks.live).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ publicationVerified: true, publicationBlocked: false, webflowStatus: 'published' });
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'published' }));
  expect(mocks.analytics).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ status: 'published' }) }));
});
it('blocks a 1050-word direct daily article on length alone despite passed editorial and CMS checks', async () => {
  vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'false');
  // Supply the oversized final body at the media boundary; leave all other
  // article fields valid and exercise the real deterministic CMS preflight.
  mocks.media.mockImplementation(async article => ({ ...article, content: '<p>' + 'Kultur '.repeat(1050) + '</p>' }));
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }] });
  const response = await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'));
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(result).toMatchObject({ publicationMode: 'auto_publish', publicationVerified: false,
    publicationBlocked: true, webflowStatus: 'draft', cmsCheck: { wordCount: 1050, structureReady: false } });
  expect(result.cmsCheck.checks.filter((check: { ok: boolean }) => !check.ok).map((check: { id: string }) => check.id)).toEqual(['length']);
  expect(result.gateResults).toContainEqual({ name: 'cms-publication', pass: false, detail: 'length' });
  expect(mocks.gates).toHaveBeenCalledTimes(1);
  expect(mocks.publish).toHaveBeenCalledTimes(1); // A saved draft is not publication.
  expect(mocks.readback).toHaveBeenCalledTimes(1);
  expect(mocks.live).not.toHaveBeenCalled();
  expect(mocks.admission).not.toHaveBeenCalled();
  expect(repair).not.toHaveBeenCalled(); // Direct daily has no automatic correction path.
  expect(plans.generate).toHaveBeenCalledTimes(1);
  expect(plans.generate).toHaveBeenCalledWith(expect.objectContaining({ preparation: false, sourceScope: 'liv-daily' }));
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'draft', webflowItemId: 'saved-item' }));
  expect(mocks.analytics).not.toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ status: 'published' }) }));
});
it.each(['draft', 'human_approval'])('never publishes in %s mode even with passed checks', async mode => {
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', mode);
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }] });
  const result = await (await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'))).json();
  expect(mocks.live).not.toHaveBeenCalled();
  expect(result.webflowStatus).toBe('draft');
  expect(mocks.media).not.toHaveBeenCalled();
});
it('retains the CMS identity when the live verification fails', async () => {
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }] });
  mocks.live.mockRejectedValue(new Error('liv_publication_live_mismatch'));
  const response = await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'));
  expect(response.status).toBe(500);
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'failed', webflowItemId: 'saved-item' }));
  expect(mocks.analytics).not.toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ status: 'published' }) }));
});
it('keeps the pause switch ahead of claim and publication', async () => {
  vi.stubEnv('LIV_DAILY_PAUSED', '1');
  const result = await (await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'))).json();
  expect(result.reason).toBe('paused');
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.media).not.toHaveBeenCalled();
});

it('checks captions after preparing and checkpointing the media revision', async () => {
  mocks.media.mockImplementation(async article => ({ ...article, content: article.content + '<figcaption>Illustration: Apropos / AI</figcaption>' }));
  await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'));
  expect(mocks.checkpoint).toHaveBeenCalledTimes(2);
  expect(mocks.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(mocks.media.mock.invocationCallOrder[0]);
  expect(mocks.media.mock.invocationCallOrder[0]).toBeLessThan(mocks.gates.mock.invocationCallOrder[0]);
  expect(mocks.gates).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('<figcaption>') }));
});
it('retains the text checkpoint and performs no CMS write on media failure', async () => {
  mocks.media.mockRejectedValue(new Error('liv_media_credited_photos_missing'));
  const response = await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'));
  expect(response.status).toBe(500);
  expect(mocks.checkpoint).toHaveBeenCalledTimes(1);
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.live).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'failed', reason: 'liv_media_credited_photos_missing' }));
});
it('does not prepare paid media in dry-run mode', async () => {
  const result = await (await GET(new NextRequest('http://localhost/api/cron/liv-daily-article?dryRun=1'))).json();
  expect(result.dryRun).toBe(true);
  expect(mocks.media).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});
it('reports a saved draft as draft in history, response and analytics', async () => {
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'human_approval');
  mocks.publish.mockResolvedValue(saveResult);
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: false, checks: [{ id: 'image:rights', ok: false }] });
  const result = await (await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'))).json();
  expect(result.webflowStatus).toBe('draft');
  expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ source: 'liv' }));
  expect(mocks.readback).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'saved-item' }));
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'draft' }));
  expect(mocks.analytics).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ status: 'draft' }) }));
});
it('preserves a saved item ID when readback fails instead of claiming success', async () => {
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'draft');
  mocks.publish.mockResolvedValue(saveResult);
  mocks.readback.mockRejectedValue(new Error('liv_cms_readback_draft_mismatch'));
  const response = await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'));
  expect(response.status).toBe(500);
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'failed', webflowItemId: 'saved-item' }));
  expect(mocks.analytics).not.toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ status: 'published' }) }));
});
it('retains the shared save error ID in daily history', async () => {
  const id = '0123456789abcdef01234567';
  mocks.publish.mockRejectedValue(new ArticleSaveError(id));
  const response = await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'));
  expect(response.status).toBe(500);
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'failed', webflowItemId: id }));
  expect(mocks.readback).not.toHaveBeenCalled();
});
it('reports actual field checks without equating them to publication', async () => {
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: false, checks: [{ id: 'field:content', ok: true }] });
  const result = await (await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'))).json();
  expect(result.gateResults).toContainEqual(expect.objectContaining({ name: 'cms-draft-fields', pass: true }));
  expect(result).toMatchObject({ saveState: 'draft', saveVerified: true, publicationVerified: false, publicationBlocked: true });
});
it('prepares tomorrow through the shared full pipeline but never publishes early', async () => {
  mocks.row = { articleCheckpoint: { title: 'Et museum åbner', content: 'Kultur '.repeat(650), slug: 'et-museum-aabner',
    subtitle: 'Udstillingen', intro: 'En intro', seoTitle: 'Museum', seoDescription: 'Kultur', section: 'Kunst',
    preparedMedia: [{}, {}, {}], researchSources: [{ url: 'https://museum.dk/news', publishedAt: '2026-09-10' }, { url: 'https://kultur.dk/news', publishedAt: '2026-09-10' }] } };
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }] });
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'),
  })).json();
  expect(result.queued).toBe(true);
  expect(mocks.claim).toHaveBeenCalledWith('2026-09-12', 'prepare');
  expect(mocks.proof.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]);
  expect(mocks.gates).toHaveBeenCalledWith(expect.objectContaining({ requireCompleteVerification: true }));
  expect(mocks.admission).toHaveBeenCalledTimes(1);
  expect(mocks.live).not.toHaveBeenCalled();
});
it('does not enqueue preparation with failed CMS checks', async () => {
  await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'reserve', defaultPlan: defaultEditorialPlan('2026-09-12', true),
  });
  expect(mocks.claim).toHaveBeenCalledWith('2026-09-12', 'reserve');
  expect(mocks.admission).not.toHaveBeenCalled(); expect(mocks.live).not.toHaveBeenCalled();
  expect(mocks.doc).toHaveBeenCalledWith('reserve-2026-09-12');
});
it('yields after saving generated text and does not spend the remaining budget on media', async () => {
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'),
  })).json();
  expect(result.status).toBe('text_prepared');
  expect(mocks.checkpoint).toHaveBeenCalledTimes(1);
  expect(mocks.yield).toHaveBeenCalledWith('2026-09-12', 'prepare');
  expect(mocks.topic).toHaveBeenCalledWith(expect.objectContaining({ currentRunId: 'prepare-2026-09-12' }));
  expect(mocks.media).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
});

it('uses the alternative editorial direction without changing the saved plan or its delivery hash', async () => {
  const dayKey = '2026-09-12';
  plans.saved = { ...defaultEditorialPlan(dayKey), topicHint: 'Rejected topic',
    directiveHint: 'Old directive', expandedDirective: 'Old expanded directive', articleFormat: 'research-review' };
  const original = structuredClone(plans.saved);
  const defaultPlan = { ...defaultEditorialPlan(dayKey), topicHint: 'Different story',
    directiveHint: 'New directive', expandedDirective: 'New expanded directive' };
  const options = { dayKey, kind: 'scheduled' as const, scope: 'prepare-alternative' as const, defaultPlan };
  await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), options);
  expect(mocks.topic).toHaveBeenCalledWith(expect.objectContaining({ topicHint: 'Different story',
    currentRunId: 'prepare-alternative-2026-09-12' }));
  expect(plans.generate).toHaveBeenCalledWith(expect.objectContaining({ directiveHint: 'New directive',
    expandedDirective: 'New expanded directive', articleFormat: undefined }));

  mocks.row = { articleCheckpoint: { title: 'Et museum åbner', content: 'Kultur '.repeat(650), slug: 'et-museum-aabner',
    subtitle: 'Udstillingen', intro: 'En intro', seoTitle: 'Museum', seoDescription: 'Kultur', section: 'Kunst',
    preparedMedia: [{}, {}, {}], researchSources: [{ url: 'https://museum.dk/news', publishedAt: '2026-09-10' },
      { url: 'https://kultur.dk/news', publishedAt: '2026-09-10' }] } };
  mocks.readback.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }] });
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), options)).json();
  expect(result.queued).toBe(true);
  expect(plans.generate).toHaveBeenCalledTimes(1); // checkpoint wins on continuation
  expect(plans.qa).toHaveBeenCalledWith(expect.objectContaining({ topicHint: 'Different story', directiveHint: 'New directive' }));
  expect(mocks.proof).toHaveBeenCalledWith(dayKey, 'prepare-alternative', expect.objectContaining({ planHash: editorialPlanHash(original) }));
  expect(mocks.admission).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ planHash: editorialPlanHash(original) }));
  expect(plans.saved).toEqual(original);
  expect(plans.failed).not.toHaveBeenCalled();
});

it('does not mark the old plan failed when an alternative has no topic', async () => {
  plans.saved = { ...defaultEditorialPlan('2026-09-12'), topicHint: 'Rejected topic' };
  mocks.topic.mockResolvedValue(null);
  await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', scope: 'prepare-alternative', defaultPlan: defaultEditorialPlan('2026-09-12'),
  });
  expect(mocks.topic).toHaveBeenCalledWith(expect.objectContaining({ topicHint: undefined }));
  expect(plans.failed).not.toHaveBeenCalled();
  expect(plans.generate).not.toHaveBeenCalled();
});
it('resumes reserve text, checkpoints media, and yields before final checks', async () => {
  mocks.row = { articleCheckpoint: { title: 'Saved text', content: 'Saved text',
    researchSources: [{ url: 'https://museum.dk/news', publishedAt: '2026-09-10' }, { url: 'https://kultur.dk/news', publishedAt: '2026-09-10' }] } };
  mocks.media.mockImplementation(async article => ({ ...article, preparedMedia: [{}, {}, {}] }));
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'reserve', defaultPlan: defaultEditorialPlan('2026-09-12', true),
  })).json();
  expect(result.status).toBe('media_prepared');
  expect(mocks.topic).not.toHaveBeenCalled();
  expect(mocks.media).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved text' }), expect.anything());
  expect(mocks.yield).toHaveBeenCalledWith('2026-09-12', 'reserve');
  expect(mocks.gates).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
});

it('supplements dated evidence before paying for images and keeps the same article checkpoint', async () => {
  const article = { title: 'Saved text', content: 'Saved text', researchSources: [{ url: 'https://museum.dk/news' }, { url: 'https://kultur.dk/news' }] };
  mocks.row = { articleCheckpoint: article };
  mocks.supplement.mockResolvedValue({ ...article, researchSupplementedAt: '2026-09-12T07:00:00Z' });
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'),
  })).json();
  expect(result.status).toBe('research_supplemented');
  expect(mocks.media).not.toHaveBeenCalled(); expect(mocks.gates).not.toHaveBeenCalled();
  expect(mocks.checkpoint).toHaveBeenLastCalledWith('2026-09-12', expect.objectContaining({ title: article.title, content: article.content }), 'prepare');
});

it('does not repeat unsuccessful supplemental searches or spend on media without dated evidence', async () => {
  mocks.row = { articleCheckpoint: { title: 'Saved text', content: 'Saved text', researchSupplementedAt: '2026-09-12T07:00:00Z',
    researchSources: [{ url: 'https://museum.dk/news' }, { url: 'https://kultur.dk/news' }] } };
  const response = await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'),
  });
  expect(response.status).toBe(500);
  expect(mocks.supplement).not.toHaveBeenCalled(); expect(mocks.media).not.toHaveBeenCalled();
});

it.each([false, true])('bounds factual correction, checkpoints it and requires all gates again (already revised=%s)', async revised => {
  const article = { title: 'Saved', content: 'Kultur '.repeat(650), intro: 'Intro', preparedMedia: [{}, {}, {}],
    factRevisionId: revised ? 'prior-revision' : undefined, factRevisionCount: revised ? 1 : 0,
    researchSources: [{ url: 'https://museum.dk/news', publishedAt: '2026-09-10' }, { url: 'https://kultur.dk/news', publishedAt: '2026-09-10' }] };
  mocks.row = { articleCheckpoint: article };
  const diagnostic = { results: [{ claim: 'En præmis', status: 'unverifiable' }] };
  mocks.gates.mockResolvedValue({ pass: false, failedGate: 'verification-complete',
    results: [{ name: 'factcheck', pass: true, skipped: true, diagnosticEvidence: diagnostic }] });
  repair.mockResolvedValue({ ...article, factRevisionId: 'audited-revision' });
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'),
  })).json();
  if (revised) {
    expect(repair).not.toHaveBeenCalled(); expect(result.skipped).toBe(true);
    expect(resumeFacts).toHaveBeenCalledTimes(1); // Archive lookup is not a new paid correction.
  } else {
    expect(repair).toHaveBeenCalledWith(article, diagnostic, {});
    expect(result.status).toBe('facts_revised');
    expect(mocks.checkpoint).toHaveBeenLastCalledWith('2026-09-12', expect.objectContaining({ factRevisionId: 'audited-revision' }), 'prepare');
    expect(mocks.yield).toHaveBeenCalledTimes(1);
  }
  expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.admission).not.toHaveBeenCalled();
});

it.each([
  { factRevisionId: 'legacy-first-revision' },
  { factRevisionId: 'inconsistent-counter', factRevisionCount: 0 },
  { factRevisionCount: 1 }, { factRevisionCount: 2 }, { factRevisionCount: -1 },
])('does not reset the correction budget for legacy or inconsistent metadata: %j', async revision => {
  const article = { title: 'Saved', intro: 'Intro', content: 'Kultur '.repeat(650), preparedMedia: [{}, {}, {}],
    ...revision, researchSources: [{ url: 'https://museum.dk/news', publishedAt: '2026-09-10' },
      { url: 'https://kultur.dk/news', publishedAt: '2026-09-10' }] };
  mocks.row = { articleCheckpoint: article };
  mocks.gates.mockResolvedValue({ pass: false, failedGate: 'verification-complete', results: [
    { name: 'factcheck', pass: true, skipped: true, diagnosticEvidence: { results: [{ status: 'unverifiable' }] } },
  ] });
  await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'), scope: 'prepare-alternative',
  });
  expect(mocks.claim).toHaveBeenCalledWith('2026-09-12', 'prepare-alternative');
  const count = revision.factRevisionCount ?? (revision.factRevisionId ? 1 : 0);
  expect(resumeFacts).toHaveBeenCalledTimes(count >= 0 && count < 2 && (count === 0 || !!revision.factRevisionId) ? 1 : 0);
  expect(repair).not.toHaveBeenCalled();
  expect(mocks.gates).toHaveBeenCalledTimes(1);
  expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.admission).not.toHaveBeenCalled();
});

it.each([true, false])('uses one correction for daily length with real failed facts only when present (%s)', async factFailure => {
  const article = { title: 'Saved', intro: 'Intro', content: '<p>' + 'Kultur '.repeat(1050) + '</p>',
    preparedMedia: [{}, {}, {}], researchSources: [
      { url: 'https://museum.dk/news', publishedAt: '2026-09-10' },
      { url: 'https://kultur.dk/news', publishedAt: '2026-09-10' },
    ] };
  mocks.row = { articleCheckpoint: article };
  const diagnostic = { complete: false, results: [{ claim: 'Wrong film title', status: 'unverifiable' }] };
  mocks.gates.mockResolvedValue(factFailure ? { pass: false, failedGate: 'verification-complete',
    results: [{ name: 'factcheck', diagnosticEvidence: diagnostic }] } : { pass: true, results: [] });
  repair.mockResolvedValue({ ...article, content: '<p>' + 'Kultur '.repeat(550) + '</p>', factRevisionId: 'one' });
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'),
  })).json();
  expect(result.status).toBe('facts_revised');
  expect(repair).toHaveBeenCalledExactlyOnceWith(article, factFailure ? diagnostic : undefined,
    { length: checkLivArticleLength(article.content) });
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.admission).not.toHaveBeenCalled();
});

it('resumes an archived correction before repeating paid safety gates or media generation', async () => {
  const diagnostic = { complete: false, results: [{ claim: 'Saved body', status: 'unverifiable' }] };
  mocks.row = { articleCheckpoint: { title: 'Saved', content: 'Saved body' },
    gateResults: [{ name: 'factcheck', diagnosticEvidence: diagnostic }] };
  resumeFacts.mockResolvedValue({ title: 'Saved', content: 'Corrected body', factRevisionId: 'archived' });
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'),
  })).json();
  expect(result.status).toBe('facts_revised');
  expect(resumeFacts).toHaveBeenCalledWith(mocks.row.articleCheckpoint, diagnostic,
    { length: checkLivArticleLength(mocks.row.articleCheckpoint.content) });
  expect(mocks.checkpoint).toHaveBeenLastCalledWith('2026-09-12', expect.objectContaining({ factRevisionId: 'archived' }), 'prepare');
  expect(mocks.gates).not.toHaveBeenCalled(); expect(mocks.media).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});

it('recovers exact-version fact diagnostics from retry audit without accepting a different article', async () => {
  const a = { title: 'Saved', content: 'Known unsupported wording' };
  const diagnostic = { articleHash: articleFingerprint([a.title, a.content].join('\n\n')), complete: false,
    results: [{ claim: a.content, status: 'unverifiable' }] };
  const gates = [{ name: 'factcheck', diagnosticEvidence: diagnostic }];
  mocks.row = { articleCheckpoint: a, reason: 'liv_fact_revision_not_applicable', gateResults: [] };
  const auditGet = vi.fn().mockResolvedValue({ docs: [
    { data: () => ({ previous: { gateResults: [{ name: 'factcheck', diagnosticEvidence: { articleHash: 'other' } }] } }) },
    { data: () => ({ previous: { gateResults: gates } }) },
  ] });
  mocks.doc.mockImplementation(() => ({ get: async () => ({ data: () => mocks.row }),
    collection: () => ({ orderBy: () => ({ limit: () => ({ get: auditGet }) }) }) }));
  resumeFacts.mockResolvedValue({ ...a, content: 'Corrected wording', factRevisionId: 'new' });
  const result = await (await runLivDaily(new NextRequest('http://localhost/api/cron/liv-prepare'), {
    dayKey: '2026-09-12', kind: 'scheduled', defaultPlan: defaultEditorialPlan('2026-09-12'),
  })).json();
  expect(result.status).toBe('facts_revised');
  expect(resumeFacts).toHaveBeenCalledWith(a, diagnostic, { length: checkLivArticleLength(a.content) });
  expect(auditGet).toHaveBeenCalledTimes(1);
  expect(mocks.gates).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
});
