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

it('dispatches the explicit reserve scope with the audited immutable plan, never a fresh default', async () => {
  const input = { dayKey: '2026-09-12', kind: 'reserve', scope: 'reserve-editorial', requestId: 'saved-writer-retry',
    reason: 'Semantic check fixed; re-evaluate original text', resumeWritingRunId: '22f6a890-794f-4041-84da-5ce28b5336d9' };
  const defaultPlan = { dayKey: input.dayKey, topicHint: 'The Gentlemen sæson 2', directiveHint: 'Original official source URLs',
    articleFormat: 'research-review', mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null };
  mocks.grant.mockResolvedValue({ status: 'retry_authorized', defaultPlan });
  expect((await POST(request(input))).status).toBe(200);
  expect(mocks.grant).toHaveBeenCalledWith(input, 'owner');
  expect(mocks.run).toHaveBeenCalledExactlyOnceWith(expect.anything(), { dayKey: input.dayKey, kind: 'reserve', scope: 'reserve-editorial', defaultPlan });
  expect(mocks.release).toHaveBeenCalledWith('owner');
});

it('never falls back to a generic reserve plan when an explicit reservation was not returned', async () => {
  expect((await POST(request({ dayKey: '2026-09-12', kind: 'reserve', scope: 'reserve-editorial', requestId: 'saved-writer-retry',
    reason: 'Re-evaluate original', resumeWritingRunId: '22f6a890-794f-4041-84da-5ce28b5336d9' }))).status).toBe(409);
  expect(mocks.run).not.toHaveBeenCalled();
});

it('rejects dryRun semantics before any retry grant', async () => {
  const req = new NextRequest('https://example.com/api/liv/operations/retry?dryRun=1', { method: 'POST', body: JSON.stringify({
    dayKey: '2026-09-12', kind: 'reserve', requestId: 'retry-123', reason: 'Fix' }) });
  expect((await POST(req)).status).toBe(400); expect(mocks.grant).not.toHaveBeenCalled();
});

const checkpointRetry = { dayKey: '2026-09-12', kind: 'reserve', scope: 'reserve-editorial',
  requestId: 'checkpoint-gates-retry-1', reason: 'Verifier fixed; recheck the saved article and photos.' };
it('dispatches checkpoint-only retry with its audited plan and no writer/rewrite options', async () => {
  const defaultPlan = { dayKey: checkpointRetry.dayKey, topicHint: 'Immutable topic', directiveHint: 'Immutable direction',
    articleFormat: 'research-review', mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null };
  mocks.grant.mockResolvedValue({ status: 'retry_authorized', defaultPlan });
  expect((await POST(request(checkpointRetry))).status).toBe(200);
  expect(mocks.grant).toHaveBeenCalledExactlyOnceWith(checkpointRetry, 'owner');
  expect(mocks.run).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
    dayKey: checkpointRetry.dayKey, kind: 'reserve', scope: 'reserve-editorial', defaultPlan });
  expect(mocks.release).toHaveBeenCalledWith('owner');
});
it('returns the existing checkpoint retry receipt without starting another continuation', async () => {
  mocks.grant.mockResolvedValue({ status: 'already_requested' });
  expect(await (await POST(request(checkpointRetry))).json()).toEqual({ status: 'already_requested' });
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledWith('owner');
});
it('does not dispatch a conflicting or unsafe saved checkpoint', async () => {
  mocks.grant.mockRejectedValue(new Error('liv_retry_conflict'));
  const response = await POST(request(checkpointRetry));
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: 'liv_retry_conflict' });
  expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledWith('owner');
});
it.each(['disabled', 'paused'])('keeps the %s switch ahead of checkpoint retry authorization', async mode => {
  vi.stubEnv(mode === 'disabled' ? 'LIV_DELIVERY_PREPARE_ENABLED' : 'LIV_DAILY_PAUSED', mode === 'disabled' ? 'false' : 'true');
  expect((await POST(request(checkpointRetry))).status).toBe(409);
  expect(mocks.grant).not.toHaveBeenCalled(); expect(mocks.lease).not.toHaveBeenCalled();
});
