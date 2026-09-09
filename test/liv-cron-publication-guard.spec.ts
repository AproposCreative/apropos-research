import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ publish: vi.fn(), finish: vi.fn(), gates: vi.fn(), claim: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: () => null }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/liv/daily-history-store', () => ({ claimLivDaily: mocks.claim, finishLivDaily: mocks.finish, todayDayKeyUTC: () => '2026-09-09' }));
vi.mock('@/lib/liv/pick-topic', () => ({ pickLivTopic: async () => ({ title: 'Et museum åbner', source: { url: 'https://museum.dk/news' } }) }));
vi.mock('@/lib/liv/generate-article', () => ({ generateLivArticle: async () => ({ title: 'Et museum åbner', subtitle: 'En ny udstilling', intro: 'Intro', content: 'Kultur '.repeat(1000), slug: 'et-museum-aabner', excerpt: 'Udstilling', section: 'Kunst', seoTitle: 'Museum', seoDescription: 'Udstilling', researchSources: [{ url: 'https://museum.dk/news', source: 'Museum' }, { url: 'https://kultur.dk/news', source: 'Kultur' }] }) }));
vi.mock('@/lib/liv/build-cms-payload', () => ({ buildLivCmsPayload: () => ({ title: 'Et museum åbner' }) }));
vi.mock('@/lib/liv/run-safety-gates', () => ({ runSafetyGates: mocks.gates }));
vi.mock('@/lib/liv/research-qa', () => ({ buildResearchQaSummary: () => ({ canAutoPublish: true, blockers: [] }) }));
vi.mock('@/lib/articles/publish', () => ({ publishCanonicalArticleToWebflow: mocks.publish }));
vi.mock('@/lib/newsletter/ga4-measurement', () => ({ sendGa4MeasurementEvent: async () => {} }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ getLivDailyPlan: async () => null, markPlanFailed: async () => {}, markPlanUsed: async () => {} }));
vi.mock('@/lib/liv/resolve-liv-topic-hints', () => ({ resolveLivTopicInputsFromPlan: () => ({}) }));
import { GET } from '@/app/api/cron/liv-daily-article/route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'auto_publish');
  vi.stubEnv('LIV_DAILY_PAUSED', '0');
  mocks.claim.mockResolvedValue({ ok: true });
  mocks.gates.mockResolvedValue({ pass: true, results: [] });
});
afterEach(() => vi.unstubAllEnvs());
it('does not publish merely because research gates passed when image/CMS checks are missing', async () => {
  const response = await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'));
  const result = await response.json();
  expect(result.skipped).toBe(true);
  expect(result.reason).toContain('cms_publication_unverified');
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith('2026-09-09', expect.objectContaining({ status: 'skipped_factcheck' }));
});
it('keeps the pause switch ahead of claim and publication', async () => {
  vi.stubEnv('LIV_DAILY_PAUSED', '1');
  const result = await (await GET(new NextRequest('http://localhost/api/cron/liv-daily-article'))).json();
  expect(result.reason).toBe('paused');
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});
