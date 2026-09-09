import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SourceSimilarityError } from '@/lib/liv/source-similarity-error';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), generate: vi.fn(), gates: vi.fn() }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: mocks.auth }));
vi.mock('@/lib/liv/pick-topic', () => ({ pickLivTopic: async () => ({ title: 'The Invite', score: 0 }) }));
vi.mock('@/lib/liv/generate-article', () => ({ generateLivArticle: mocks.generate }));
vi.mock('@/lib/liv/daily-history-store', () => ({ todayDayKeyUTC: () => '2026-09-09' }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ getLivDailyPlan: async () => null }));
vi.mock('@/lib/liv/expand-directive', () => ({ expandDirective: async () => ({ expandedDirective: 'Film review' }) }));
vi.mock('@/lib/liv/run-safety-gates', () => ({ runSafetyGates: mocks.gates }));
import { POST } from '@/app/api/liv/preview/route';

const request = () => new NextRequest('https://studio.example/api/liv/preview', {
  method: 'POST', body: JSON.stringify({ generate: true, topicHint: 'The Invite', mustUseTrending: false }),
});
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue('editor-fixture'); });

it.each([true, false])('returns actionable JSON and keeps publication blocked, complete=%s', async complete => {
  mocks.generate.mockRejectedValue(new SourceSimilarityError({ pass: false, complete,
    scores: { embeddingSim: 0.9, ngramJaccard: 0.1, openingSim: 0 } },
  { url: 'https://example.com/source?private=hidden', contentHash: 'hash' }));
  const response = await POST(request());
  expect(response.status).toBe(complete ? 422 : 503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const data = await response.json();
  expect(data).toMatchObject({ ok: false, gatePass: false, canAutoPublish: false,
    diagnostic: { sourceHost: 'example.com', complete } });
  expect(data).not.toHaveProperty('article');
  expect(JSON.stringify(data)).not.toContain('hidden');
  expect(mocks.gates).not.toHaveBeenCalled();
});

it('still rejects unauthenticated generation before calling any model', async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(mocks.generate).not.toHaveBeenCalled();
});
