import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ row: undefined as any, ingest: vi.fn() }));
vi.mock('@/lib/config/env', () => ({ env: { CRON_SECRET: 'test-cron' } }));
vi.mock('@/lib/trending/ingest-runner', () => ({ runIngestToFirestore: state.ingest }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: () => ({ doc: () => ({}) }),
  runTransaction: async (fn: any) => fn({
    get: async () => ({ data: () => state.row }),
    set: (_ref: any, value: any) => { state.row = { ...state.row, ...value }; },
    update: (_ref: any, value: any) => { state.row = { ...state.row, ...value }; },
  }),
}) }));
import { GET } from '@/app/api/cron/liv-source-refresh/route';
const request = (query = '', auth = true) => new NextRequest(`https://app.test/api/cron/liv-source-refresh${query}`, {
  headers: auth ? { authorization: 'Bearer test-cron' } : {},
});
beforeEach(() => { state.row = undefined; vi.clearAllMocks(); state.ingest.mockReset().mockResolvedValue({ added: 2 }); });
it('rejects unauthenticated requests including dry-run', async () => {
  expect((await GET(request('', false))).status).toBe(403);
  expect((await GET(request('?dryRun=1', false))).status).toBe(403);
  expect(state.row).toBeUndefined(); expect(state.ingest).not.toHaveBeenCalled();
});
it('dry-run performs no ingestion or writes', async () => {
  expect((await GET(request('?dryRun=1'))).status).toBe(200);
  expect(state.row).toBeUndefined(); expect(state.ingest).not.toHaveBeenCalled();
});
it('ingests bounded sources once with no pruning and reuses its cooldown', async () => {
  expect((await GET(request())).status).toBe(200);
  expect(state.ingest).toHaveBeenCalledWith({ sinceHrs: 72, limit: 20, maxDurationMs: 180000 });
  expect(state.row).toMatchObject({ status: 'completed', leaseUntil: 0, metrics: { added: 2 } });
  await GET(request()); expect(state.ingest).toHaveBeenCalledTimes(1);
});
it('keeps the lease on failure and never exposes internal errors', async () => {
  state.ingest.mockRejectedValue(new Error('private diagnostic'));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'source_refresh_failed' });
  expect(state.row.leaseUntil).toBeGreaterThan(Date.now());
  await GET(request()); expect(state.ingest).toHaveBeenCalledTimes(1);
});
it('does not start a second ingestion while a lease is active', async () => {
  state.row = { leaseUntil: Date.now() + 60000 };
  expect(await (await GET(request())).json()).toEqual({ status: 'already_refreshed_or_running' });
  expect(state.ingest).not.toHaveBeenCalled();
});
