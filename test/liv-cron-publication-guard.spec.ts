import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
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
vi.mock('@/lib/liv/generate-article', () => ({ generateLivArticle: async () => ({ title: 'Et museum åbner', subtitle: 'En ny udstilling', intro: 'Intro', content: 'Kultur '.repeat(1000), slug: 'et-museum-aabner', excerpt: 'Udstilling', section: 'Kunst', seoTitle: 'Museum', seoDescription: 'Udstilling', researchSources: [{ url: 'https://museum.dk/news', source: 'Museum' }, { url: 'https://kultur.dk/news', source: 'Kultur' }] }) }));
vi.mock('@/lib/liv/build-cms-payload', () => ({ buildLivCmsPayload: () => ({ title: 'Et museum åbner' }) }));
vi.mock('@/lib/liv/run-safety-gates', () => ({ runSafetyGates: mocks.gates }));
vi.mock('@/lib/liv/research-qa', () => ({ buildResearchQaSummary: () => ({ canAutoPublish: true, blockers: [] }) }));
vi.mock('@/lib/articles/publish', () => ({ publishArticleDraftToWebflow: mocks.publish }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: mocks.readback }));
vi.mock('@/lib/newsletter/ga4-measurement', () => ({ sendGa4MeasurementEvent: mocks.analytics }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ getLivDailyPlan: async () => null, markPlanFailed: async () => {}, markPlanUsed: async () => {} }));
vi.mock('@/lib/liv/resolve-liv-topic-hints', () => ({ resolveLivTopicInputsFromPlan: () => ({}) }));
import { GET } from '@/app/api/cron/liv-daily-article/route';
import { ArticleSaveError } from '@/lib/articles/save-receipt';
import { runLivDaily } from '@/lib/liv/run-daily';
import { defaultEditorialPlan } from '@/lib/liv/rolling-plan';

const saveResult = { articleId: 'saved-item', publicationVerified: false,
  receipt: { saveState: 'draft', saveVerified: true, cmsLocaleId: 'locale' } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.row = undefined;
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
