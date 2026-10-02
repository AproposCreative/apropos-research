import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ scan: vi.fn(), enqueue: vi.fn() }));
vi.mock('@/lib/seo-engine/secret-guards', () => ({ requireCronSecret: () => true }));
vi.mock('@/lib/seo-engine/opportunity-engine/engine', () => ({ runOpportunityScan: m.scan }));
vi.mock('@/lib/seo-engine/post-publish/performance', () => ({ enqueuePerformanceReviews: m.enqueue }));
vi.mock('@/lib/seo-engine/opportunity-engine/store', () => ({ claimOpportunityCronSlot: async () => true, completeOpportunityCronSlot: async () => {}, releaseOpportunityCronSlot: async () => {} }));
import { handleOpportunityCron } from '@/lib/seo-engine/opportunity-engine/cron';
beforeEach(() => { vi.clearAllMocks(); m.scan.mockResolvedValue({ status: 'ok', opportunities: [], opportunityCount: 0 }); });
it.each(['daily', 'weekly'] as const)('%s cron only collects analytics without archive AI optimization', async cadence => {
  const response = await handleOpportunityCron(new NextRequest('https://app.example/api/cron/seo'), cadence);
  expect(response.status).toBe(200);
  expect(m.scan).toHaveBeenCalledWith(expect.objectContaining({ mode: 'collect' }));
  expect(m.enqueue).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ queuedCount: 0, appliedCount: 0 });
});
