import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SourceSimilarityError } from '@/lib/liv/source-similarity-error';
import { ArticleEvidenceError } from '@/lib/liv/article-output';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), generate: vi.fn(), gates: vi.fn(), readBrief: vi.fn() }));
vi.mock('@/lib/liv/source-archive', () => ({ readWritingBrief: mocks.readBrief }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: mocks.auth }));
vi.mock('@/lib/liv/pick-topic', () => ({ pickLivTopic: async () => ({ title: 'The Invite', score: 0 }) }));
vi.mock('@/lib/liv/generate-article', () => ({ generateLivArticle: mocks.generate }));
vi.mock('@/lib/liv/daily-history-store', () => ({ todayDayKeyUTC: () => '2026-09-09' }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ getLivDailyPlan: async () => null }));
vi.mock('@/lib/liv/expand-directive', () => ({ expandDirective: async () => ({ expandedDirective: 'Film review' }) }));
vi.mock('@/lib/liv/run-safety-gates', () => ({ runSafetyGates: mocks.gates }));
import { GET, POST } from '@/app/api/liv/preview/route';

const request = () => new NextRequest('https://studio.example/api/liv/preview', {
  method: 'POST', body: JSON.stringify({ generate: true, topicHint: 'The Invite', mustUseTrending: false }),
});
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue('editor-fixture'); });

it('reads stored diagnostics only in the authenticated scope with no cache or approval', async () => {
  mocks.readBrief.mockResolvedValue({ writerText: 'Private research notes', status: 'not_verified' });
  const res = await GET(new NextRequest('https://studio.example/api/liv/preview?researchRunId=fixture&uid=another-user'));
  expect(mocks.readBrief).toHaveBeenCalledWith('editor-fixture', 'fixture');
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toMatchObject({ canAutoPublish: false, research: { status: 'not_verified' } });
  expect(mocks.generate).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue(null);
  mocks.readBrief.mockClear();
  expect((await GET(new NextRequest('https://studio.example/api/liv/preview?researchRunId=fixture'))).status).toBe(401);
  expect(mocks.readBrief).not.toHaveBeenCalled();
});

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

it('returns a private research diagnostic as a business rejection, never an approved article', async () => {
  const error = new ArticleEvidenceError(['En konkret indvending mod filmens slutning mangler.']);
  error.attachBrief('[S1; example.com] En neutral note.', 'model-fixture', 'liv-v4');
  mocks.generate.mockRejectedValue(error);
  const response = await POST(request());
  expect(response.status).toBe(422);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const data = await response.json();
  expect(data).toMatchObject({ ok: false, code: 'article_evidence_insufficient', canAutoPublish: false,
    gatePass: false, blockedReview: { kind: 'research', status: 'blocked', text: expect.stringContaining('En neutral note.') } });
  expect(data).not.toHaveProperty('article');
  expect(mocks.gates).not.toHaveBeenCalled();
  expect(JSON.stringify(error)).not.toContain('En neutral note.');
});

it('returns review-only text to the authenticated editor without an article or any approval', async () => {
  mocks.generate.mockRejectedValue(new SourceSimilarityError({ pass: false, complete: true,
    scores: { embeddingSim: 0.8, ngramJaccard: 0.3, openingSim: 0.1 } },
  { url: 'https://example.com/source', contentHash: 'hash' },
  { text: 'Private generated draft for editorial comparison.', model: 'fixture-model', voiceVersion: 'fixture-voice' }));
  const response = await POST(request());
  expect(response.status).toBe(422);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const data = await response.json();
  expect(data).toMatchObject({ ok: false, gatePass: false, canAutoPublish: false,
    blockedReview: { status: 'blocked', text: 'Private generated draft for editorial comparison.', model: 'fixture-model', voiceVersion: 'fixture-voice' } });
  expect(data).not.toHaveProperty('article');
  expect(mocks.gates).not.toHaveBeenCalled();
});
