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
  expect(result.alerts.available).toBe(false);
  expect(JSON.stringify(result)).not.toContain('private');
});
it('shows the next eligible story, excluding rejected and blocked work', async () => {
  const entry = { itemId: 'a', title: 'Næste anmeldelse', slug: 'next', scheduledDay: '2026-09-14', expiresDay: '2026-09-15', kind: 'scheduled', state: 'ready', preparedAt: '2026-09-13', payloadHash: 'private' };
  mocks.delivery.mockResolvedValue({ slots: { '2026-09-13': { state: 'published' } }, entries: [
    { ...entry, itemId: 'blocked', title: 'Blocked', publicationBlockers: ['gate'] },
    { ...entry, itemId: 'rejected', title: 'Rejected', decision: 'rejected' }, entry,
  ] });
  const result = await readEditorialOperations(new Date('2026-09-13T12:00:00Z'));
  expect(result.liv).toMatchObject({ available: true, data: { nextDay: '2026-09-14', nextStory: { title: 'Næste anmeldelse', state: 'ready' } } });
  if (result.liv.available) expect(Object.keys(result.liv.data.nextStory!)).toEqual(['title', 'state']);
});
it('prioritizes a missing today rather than promising a future story', async () => {
  mocks.delivery.mockResolvedValue({ entries: [], slots: {} });
  expect((await readEditorialOperations(new Date('2026-09-13T12:00:00Z'))).liv).toMatchObject({ available: true, data: { nextDay: '2026-09-13', nextStory: null } });
});
