import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/seo-engine/require-auth', () => ({ requireSeoEngineUser: vi.fn(async () => ({ ok: true, userId: 'editor' })) }));
vi.mock('@/lib/seo-engine/opportunity-engine/engine', () => ({ runOpportunityScan: vi.fn(async () => ({ opportunities: [] })) }));
vi.mock('@/lib/seo-engine/post-publish/performance', () => ({ enqueuePerformanceReviews: vi.fn() }));
import { POST } from '../app/api/seo-engine/opportunities/scan/route';
import { runOpportunityScan } from '../lib/seo-engine/opportunity-engine/engine';
import { enqueuePerformanceReviews } from '../lib/seo-engine/post-publish/performance';
beforeEach(() => vi.clearAllMocks());
const scan = (body: object) => POST(new NextRequest('http://localhost/api/seo-engine/opportunities/scan', { method: 'POST', body: JSON.stringify(body) }));
it('defaults to collect without CMS writes', async () => {
  await scan({});
  expect(runOpportunityScan).toHaveBeenCalledWith(expect.objectContaining({ mode: 'collect' }));
  expect(enqueuePerformanceReviews).not.toHaveBeenCalled();
});
it('optimize alone is still read-only for CMS', async () => {
  await scan({ mode: 'optimize' });
  expect(enqueuePerformanceReviews).not.toHaveBeenCalled();
});
it('requires explicit apply opt-in', async () => {
  await scan({ mode: 'optimize', autoApply: true });
  expect(enqueuePerformanceReviews).toHaveBeenCalledOnce();
});
