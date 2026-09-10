import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), legacy: vi.fn(), delivery: vi.fn(), state: vi.fn(), uid: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: mocks.auth }));
vi.mock('@/lib/liv/run-daily', () => ({ runLivDaily: mocks.legacy }));
vi.mock('@/lib/liv/deliver-ready', () => ({ deliverReadyArticle: mocks.delivery }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: mocks.state }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: mocks.uid }));
import { GET as daily } from '@/app/api/cron/liv-daily-article/route';
import { GET as check } from '@/app/api/cron/liv-delivery-check/route';
import { GET as status } from '@/app/api/liv/delivery/route';
const request = () => new NextRequest('https://local.test/api/cron/liv-daily-article');
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'true');
  vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'false'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'auto_publish');
  mocks.delivery.mockResolvedValue({ status: 'waiting' });
  mocks.legacy.mockResolvedValue(NextResponse.json({ status: 'legacy' }));
  mocks.state.mockResolvedValue({ entries: [], slots: {} });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it('rejects unauthenticated cron before either worker', async () => {
  mocks.auth.mockReturnValue(NextResponse.json({ error: 'unauthorized' }, { status: 401 }));
  expect((await daily(request())).status).toBe(401);
  expect(mocks.delivery).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
});
it('chooses only one publisher in queue mode', async () => {
  await daily(request()); expect(mocks.delivery).toHaveBeenCalledTimes(1); expect(mocks.legacy).not.toHaveBeenCalled();
});
it('retains the old daily route until explicit rollout and keeps extra ticks inert', async () => {
  vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'false');
  await daily(request()); await check(request());
  expect(mocks.legacy).toHaveBeenCalledTimes(1); expect(mocks.delivery).not.toHaveBeenCalled();
});
it.each(['draft', 'human_approval'])('does not publish when mode is %s', async mode => {
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', mode); await daily(request());
  expect(mocks.delivery).not.toHaveBeenCalled();
});
it('respects pause and dry run', async () => {
  vi.stubEnv('LIV_DAILY_PAUSED', 'true'); await daily(request());
  vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  await daily(new NextRequest('https://local.test/api/cron/liv-daily-article?dryRun=1'));
  expect(mocks.delivery).not.toHaveBeenCalled();
});
it('returns a monitor-visible error when the deadline has been missed', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-11T08:15:00Z'));
  const response = await check(request());
  expect(response.status).toBe(503);
  expect((await response.json()).health.overdue).toBe(true);
});
it('protects queue titles behind the existing authentication', async () => {
  mocks.uid.mockResolvedValue(null);
  expect((await status(request())).status).toBe(401); expect(mocks.state).not.toHaveBeenCalled();
});
it('reports database failure as unknown rather than an empty healthy queue', async () => {
  mocks.uid.mockResolvedValue('editor'); mocks.state.mockRejectedValue(new Error('offline'));
  expect((await status(request())).status).toBe(503);
});
