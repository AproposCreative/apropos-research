import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), read: vi.fn(), activate: vi.fn(), hold: vi.fn() }));
vi.mock('@/lib/editorial-access', () => ({ editorialRequestAccess: m.auth }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.create } } }), models: { default: 'fixture' } }));
vi.mock('@/lib/research/service', () => ({ getResearch: vi.fn() }));
vi.mock('@/lib/ai/provider-hold', () => ({ readProviderHold: m.hold }));
vi.mock('@/lib/ai/manual-writer-budget', async original => ({ ...await original<typeof import('@/lib/ai/manual-writer-budget')>(), readManualWriterBudget: m.read, activateManualWriterBudget: m.activate }));
import { POST as write } from '@/app/api/ai-chat/route';
import * as budget from '@/app/api/ai-cost/writer/route';
import { manualWriterUid, MANUAL_WRITER_BUDGET_ID } from '@/lib/ai/manual-writer-budget';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
import { readFileSync } from 'node:fs';
const row = { id: MANUAL_WRITER_BUDGET_ID, mode: 'manual-writer-only-v1', limitDkkMicros: 50e6,
  committedDkkMicros: 1e6, reservedDkkMicros: 2e6, calls: 3, unknownCalls: 1, blocked: false, activatedBy: 'private-owner' };
const req = (body: unknown) => new NextRequest('https://test/api/ai-chat', { method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer verified-by-fixture' } });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  m.auth.mockResolvedValue({ uid: 'real-editor', owner: false });
  m.read.mockResolvedValue(row); m.activate.mockResolvedValue(row); m.hold.mockResolvedValue({ blocked: false });
});
afterEach(() => vi.unstubAllEnvs());
it('refuses a cron secret, unauthenticated caller or forged identity without a model request', async () => {
  m.auth.mockResolvedValue(null);
  const result = await write(req({ message: 'Skriv', uid: 'casper', manualWriter: true }));
  expect(result.status).toBe(401); expect(m.create).not.toHaveBeenCalled();
});
it('uses only the verified editor identity, never client flags, and clears ALS afterwards', async () => {
  m.create.mockImplementation(async () => {
    expect(manualWriterUid()).toBe('real-editor');
    return { choices: [{ finish_reason: 'stop', message: { content: 'Fixture svar' } }] };
  });
  expect((await write(req({ message: 'Hej', uid: 'victim', manualWriterUid: 'victim' }))).status).toBe(200);
  expect(m.create).toHaveBeenCalledTimes(1); expect(manualWriterUid()).toBeUndefined();
});
it.each(['liv_cost_provider_quota_exhausted', 'liv_cost_manual_writer_budget_exceeded', 'liv_cost_manual_writer_only'])('returns an honest non-retryable %s message', async code => {
  m.create.mockRejectedValue(new Error('Connection error', { cause: new LivCostPretransportError(code) }));
  const result = await write(req({ message: 'Hej' }));
  expect(result.status).toBe(503);
  expect(await result.json()).toMatchObject({ errorCode: 'AI_BUDGET_BLOCKED', reason: code, retryable: false });
});
it('exposes only a private, read-only team budget status, not owner identity', async () => {
  const result = await budget.GET(req({}));
  expect(result.headers.get('cache-control')).toBe('private, no-store');
  const data = await result.json();
  expect(data).toMatchObject({ limitDkk: 50, remainingDkk: 47, resetsAutomatically: false, available: true });
  expect(JSON.stringify(data)).not.toContain('private-owner'); expect(m.activate).not.toHaveBeenCalled();
  m.hold.mockResolvedValue({ blocked: true }); expect((await (await budget.GET(req({}))).json()).available).toBe(false);
});
it('requires an owner and the exact fixed 50 DKK request; cannot top up/reset/increase', async () => {
  const input = { action: 'activate-manual-writer-only', requestId: MANUAL_WRITER_BUDGET_ID, limitDkk: 50 };
  expect((await budget.POST(req(input))).status).toBe(403);
  m.auth.mockResolvedValue({ uid: 'owner', owner: true });
  expect((await budget.POST(req({ ...input, limitDkk: 51 }))).status).toBe(400);
  expect((await budget.POST(req({ ...input, requestId: 'a-new-allowance' }))).status).toBe(400);
  expect((await budget.POST(req(input))).status).toBe(200);
  expect(m.activate).toHaveBeenCalledExactlyOnceWith('owner');
});
it('client sends its Firebase token and does not offer blind retry for guarded failures', () => {
  const client = readFileSync('app/ai/AIWriterClient.tsx', 'utf8');
  expect(client).toContain('Authorization: `Bearer ${await user.getIdToken()}`');
  expect(client).toContain('setLastFailedMessage(errorData.retryable === false ? null : trimmedMessage)');
  expect(client).toContain("errorData.errorCode === 'AI_BUDGET_BLOCKED'");
});
