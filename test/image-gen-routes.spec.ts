import { beforeEach, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({ access: vi.fn(), budget: vi.fn(), list: vi.fn(), article: vi.fn(), jobs: vi.fn(), job: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: fixtures.access }));
vi.mock('@/lib/image-gen/budget', () => ({ readImageGenBudget: fixtures.budget }));
vi.mock('@/lib/image-gen/webflow', () => ({ listImageGenArticles: fixtures.list, readImageGenArticle: fixtures.article }));
vi.mock('@/lib/image-gen/jobs', () => ({ listImageGenJobs: fixtures.jobs, readImageGenJob: fixtures.job }));
import { GET as budget } from '@/app/api/image-gen/budget/route';
import { GET as articles } from '@/app/api/image-gen/articles/route';
import { GET as jobs } from '@/app/api/image-gen/jobs/route';
beforeEach(() => { vi.resetAllMocks(); });
it.each([budget, articles, jobs])('denies anonymous requests before reading any private data', async route => {
  fixtures.access.mockResolvedValue(null);
  const response = await route(new Request('https://example.test/api/image-gen'));
  expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('private, no-store');
  for (const call of [fixtures.budget, fixtures.list, fixtures.article, fixtures.jobs, fixtures.job]) expect(call).not.toHaveBeenCalled();
});
it.each(['frederik', 'casper', 'milo'])('permits an authorized %s account without requiring owner capability', async uid => {
  fixtures.access.mockResolvedValue({ uid, owner: uid === 'frederik', role: 'editor' });
  fixtures.budget.mockResolvedValue({ status: 'ready', monthlyLimitDkk: 150 });
  fixtures.jobs.mockResolvedValue([]); fixtures.list.mockResolvedValue({ articles: [], nextCursor: null });
  for (const route of [budget, articles, jobs]) expect((await route(new Request('https://example.test/api/image-gen'))).status).toBe(200);
  expect(fixtures.jobs).toHaveBeenCalledWith(uid);
});
it('ignores forged UID and scopes job reads to verified identity', async () => {
  fixtures.access.mockResolvedValue({ uid: 'milo', owner: false }); fixtures.job.mockResolvedValue(null);
  const id = 'a'.repeat(64);
  const response = await jobs(new Request(`https://example.test/api/image-gen/jobs?id=${id}&uid=frederik`));
  expect(response.status).toBe(404); expect(fixtures.job).toHaveBeenCalledWith('milo', id);
});
it('rejects malformed article/job IDs before service calls', async () => {
  fixtures.access.mockResolvedValue({ uid: 'milo' });
  expect((await articles(new Request('https://example.test/api/image-gen/articles?id=../other'))).status).toBe(400);
  expect((await jobs(new Request('https://example.test/api/image-gen/jobs?id=../other'))).status).toBe(400);
  expect(fixtures.article).not.toHaveBeenCalled(); expect(fixtures.job).not.toHaveBeenCalled();
});
it('does not expose upstream errors or turn failures into empty success', async () => {
  fixtures.access.mockResolvedValue({ uid: 'milo' }); fixtures.list.mockRejectedValue(new Error('private upstream detail'));
  const response = await articles(new Request('https://example.test/api/image-gen/articles'));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('private upstream detail');
});
