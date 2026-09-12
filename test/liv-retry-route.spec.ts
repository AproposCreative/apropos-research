import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), grant: vi.fn(), lease: vi.fn(), release: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: mocks.auth }));
vi.mock('@/lib/liv/retry-preparation', () => ({ authorizePreparationRetry: mocks.grant }));
vi.mock('@/lib/liv/delivery-store', () => ({ claimPreparation: mocks.lease, releasePreparation: mocks.release }));
vi.mock('@/lib/liv/run-daily', () => ({ runLivDaily: mocks.run }));
import { POST } from '@/app/api/liv/operations/retry/route';
const request = (body: unknown = { dayKey: '2026-09-12', kind: 'scheduled', requestId: 'retry-123', reason: 'Credit restored' }) =>
  new NextRequest('https://example.com/api/liv/operations/retry', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  mocks.release.mockResolvedValue(undefined);
  mocks.lease.mockResolvedValue('owner'); mocks.grant.mockResolvedValue({ status: 'retry_authorized' });
  mocks.run.mockResolvedValue(NextResponse.json({ status: 'text_prepared' })); });
afterEach(() => vi.unstubAllEnvs());
it('checks service authentication before leases, audit writes or paid work', async () => {
  mocks.auth.mockReturnValue(NextResponse.json({}, { status: 403 }));
  expect((await POST(request())).status).toBe(403); expect(mocks.lease).not.toHaveBeenCalled();
});
it('rejects malformed requests without acquiring a lease', async () => {
  expect((await POST(request(null))).status).toBe(400); expect(mocks.lease).not.toHaveBeenCalled();
});
it('never starts work on replay of the same retry', async () => {
  mocks.grant.mockResolvedValue({ status: 'already_requested' });
  expect(await (await POST(request())).json()).toEqual({ status: 'already_requested' });
  expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledWith('owner');
});
it('uses the shared server workflow and always releases its preparation lease', async () => {
  expect(await (await POST(request())).json()).toEqual({ status: 'text_prepared' });
  expect(mocks.run).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dayKey: '2026-09-12', kind: 'scheduled' }));
  expect(mocks.release).toHaveBeenCalledWith('owner');
});
it('passes the explicit alternative scope into the shared workflow', async () => {
  const input = { dayKey: '2026-09-12', kind: 'scheduled', scope: 'prepare-alternative', requestId: 'alternative-retry', reason: 'Provider restored' };
  expect((await POST(request(input))).status).toBe(200);
  expect(mocks.grant).toHaveBeenCalledWith(input);
  expect(mocks.run).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dayKey: input.dayKey, scope: input.scope }));
});
it('does not race a currently preparing worker', async () => {
  mocks.lease.mockResolvedValue(null); expect((await POST(request())).status).toBe(409);
  expect(mocks.grant).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
});
