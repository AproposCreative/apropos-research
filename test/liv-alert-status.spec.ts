import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), doc: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: mocks.doc }) }) }));
import { readDeliveryAlertStatus } from '@/lib/liv/alert-status';
const now = new Date('2026-09-13T22:30:00Z');
beforeEach(() => { vi.resetAllMocks(); mocks.doc.mockReturnValue({ get: mocks.get }); });
it('uses the Danish day and does not invent successful mail', async () => {
  mocks.get.mockResolvedValue({ exists: false, data: () => undefined });
  expect(await readDeliveryAlertStatus(now)).toEqual({ day: '2026-09-14', status: 'not_recorded' });
  expect(mocks.doc).toHaveBeenCalledWith('2026-09-14');
});
it.each([
  [{ failure: { accepted: true } }, 'failure_accepted'],
  [{ failure: { accepted: true }, resolved: { accepted: true } }, 'resolved_accepted'],
  [{ failure: { startedAt: now.getTime() } }, 'unconfirmed'],
  [{ failure: { startedAt: now.getTime() - 23 * 3600000 } }, 'reconciliation_required'],
  [{}, 'unknown'],
])('projects only status and day', async (raw, status) => {
  mocks.get.mockResolvedValue({ exists: true, data: () => ({ ...raw, payload: 'private', providerId: 'secret' }) });
  expect(await readDeliveryAlertStatus(now)).toEqual({ day: '2026-09-14', status });
});
it('propagates store failure instead of reporting no alarm', async () => {
  mocks.get.mockRejectedValue(new Error('offline'));
  await expect(readDeliveryAlertStatus(now)).rejects.toThrow('offline');
});
