import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), delivery: vi.fn(), budget: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: (id: string) => ({ get: () => mocks.get(id) }) }) }) }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: mocks.delivery }));
vi.mock('@/lib/liv/cost-ledger', () => ({ readSharedCostSummary: mocks.budget }));
import { readEditorialOperations, readNewsletterOperations } from '@/lib/editorial-operations';
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ exists: false, data: () => undefined }); });
it('reports absent history as unrecorded, not successful', async () => {
  expect(await readNewsletterOperations(new Date('2026-09-13'))).toMatchObject({ week: '2026-W37', status: 'not_recorded', settingsSource: 'default' });
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
it('does not silently default on a failed read', async () => {
  mocks.get.mockRejectedValue(new Error('private provider details'));
  await expect(readNewsletterOperations()).rejects.toThrow();
});
it('returns independent safe unavailable sections without error bodies', async () => {
  mocks.get.mockRejectedValue(new Error('private'));
  mocks.delivery.mockRejectedValue(new Error('private'));
  mocks.budget.mockResolvedValue({ fullMonthlyCapVerified: false });
  const result = await readEditorialOperations();
  expect(result.liv.available).toBe(false);
  expect(result.newsletter.available).toBe(false);
  expect(result.budget.available).toBe(true);
  expect(JSON.stringify(result)).not.toContain('private');
});
