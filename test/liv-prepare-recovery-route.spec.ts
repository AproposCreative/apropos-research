import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ row: undefined as Record<string, unknown> | undefined,
  run: vi.fn(), release: vi.fn(), admit: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: mocks.auth }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => ({
  get: async () => ({ exists: !!mocks.row, data: () => mocks.row }),
}) }) }) }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ ensureLivDailyPlan: vi.fn() }));
vi.mock('@/lib/liv/daily-history-store', () => ({ LIV_DAILY_COLLECTION: 'fixture', livDailyDocId: (day: string) => day }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: async () => ({ entries: [], slots: {} }),
  claimPreparation: async () => 'lease', releasePreparation: mocks.release }));
vi.mock('@/lib/liv/run-daily', () => ({ runLivDaily: mocks.run }));
vi.mock('@/lib/liv/prepared-admission', () => ({ admitPreparedArticle: mocks.admit }));
import { GET } from '@/app/api/cron/liv-prepare/route';
beforeEach(() => {
  vi.resetAllMocks(); mocks.row = undefined;
  mocks.release.mockResolvedValue(undefined);
  vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  mocks.run.mockResolvedValue(NextResponse.json({ status: 'fixture' }));
});
afterEach(() => vi.unstubAllEnvs());
const request = () => new NextRequest('https://app.example/api/cron/liv-prepare');
it('starts just one bounded job for an empty queue', async () => {
  await GET(request()); expect(mocks.run).toHaveBeenCalledTimes(1); expect(mocks.release).toHaveBeenCalledWith('lease');
});
it('does not let a legacy pre-generation no-topic record permanently block tomorrow', async () => {
  mocks.row = { status: 'skipped_no_topic' };
  await GET(request()); expect(mocks.run).toHaveBeenCalledTimes(1);
});
it.each([
  { status: 'skipped_no_topic', articleCheckpoint: { title: 'Saved work' } },
  { status: 'skipped_no_topic', preparationAttempts: 3 },
  { status: 'failed', webflowItemId: 'known-item' },
  { status: 'skipped_factcheck' },
])('does not regenerate preserved or terminal work: %j', async row => {
  mocks.row = row;
  const response = await GET(request());
  expect((await response.json()).status).toBe('no_unstarted_work');
  expect(mocks.run).not.toHaveBeenCalled();
});
it('keeps authentication before preparation and storage', async () => {
  mocks.auth.mockReturnValue(NextResponse.json({ error: 'unauthorized' }, { status: 401 }));
  expect((await GET(request())).status).toBe(401);
  expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled();
});
