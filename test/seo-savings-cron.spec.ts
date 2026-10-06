import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ scan: vi.fn(), enqueue: vi.fn() }));
vi.mock('@/lib/seo-engine/secret-guards', () => ({ requireCronSecret: () => true }));
vi.mock('@/lib/seo-engine/opportunity-engine/engine', () => ({ runOpportunityScan: m.scan }));
vi.mock('@/lib/seo-engine/post-publish/performance', () => ({ enqueuePerformanceReviews: m.enqueue }));
vi.mock('@/lib/seo-engine/opportunity-engine/store', () => ({ claimOpportunityCronSlot: async () => true, completeOpportunityCronSlot: async () => {}, releaseOpportunityCronSlot: async () => {} }));
import { handleOpportunityCron } from '@/lib/seo-engine/opportunity-engine/cron';
beforeEach(() => { vi.clearAllMocks(); m.enqueue.mockResolvedValue({ queued: ['automatic-job'], skipped: [] }); m.scan.mockResolvedValue({ status: 'ok', opportunities: [], opportunityCount: 0 }); });
it.each(['daily', 'weekly'] as const)('%s cron automatically queues reviews but never reports them as applied', async cadence => {
  const response = await handleOpportunityCron(new NextRequest('https://app.example/api/cron/seo'), cadence);
  expect(response.status).toBe(200);
  expect(m.scan).toHaveBeenCalledWith(expect.objectContaining({ mode: 'collect' }));
  expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
  expect(await response.json()).toMatchObject({ queuedCount: 1, appliedCount: 0 });
});
