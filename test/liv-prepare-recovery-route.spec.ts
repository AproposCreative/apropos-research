import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { DeliveryState, ReadyEntry } from '@/lib/liv/delivery-policy';
const mocks = vi.hoisted(() => ({ row: undefined as Record<string, unknown> | undefined,
  rows: new Map<string, Record<string, unknown>>(), state: { entries: [], slots: {} } as DeliveryState,
  run: vi.fn(), release: vi.fn(), admit: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/cron/cron-auth', () => ({ requireCronBearer: mocks.auth }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: (id: string) => ({
  get: async () => { const row = mocks.rows.get(id) ?? mocks.row; return { exists: !!row, data: () => row }; },
}) }) }) }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ ensureLivDailyPlan: vi.fn() }));
vi.mock('@/lib/liv/daily-history-store', () => ({ LIV_DAILY_COLLECTION: 'fixture', livDailyDocId: (day: string, scope: string) => `${scope}-${day}` }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: async () => structuredClone(mocks.state),
  claimPreparation: async () => 'lease', releasePreparation: mocks.release }));
vi.mock('@/lib/liv/run-daily', () => ({ runLivDaily: mocks.run }));
vi.mock('@/lib/liv/prepared-admission', () => ({ admitPreparedArticle: mocks.admit }));
import { GET } from '@/app/api/cron/liv-prepare/route';
beforeEach(() => {
  vi.resetAllMocks(); mocks.row = undefined; mocks.rows.clear(); mocks.state = { entries: [], slots: {} };
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T08:00:00Z'));
  mocks.release.mockResolvedValue(undefined);
  vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  mocks.run.mockResolvedValue(NextResponse.json({ status: 'fixture' }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
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

const today = '2026-09-12';
const reserveDays = [today, '2026-09-13', '2026-09-14'];
const reserveItem = (index: number): ReadyEntry => ({ itemId: String(index + 1).repeat(24), slug: `reserve-${index}`,
  title: `Saved reserve ${index}`, scheduledDay: today, expiresDay: `2026-09-${17 + index}`,
  kind: 'reserve', state: 'ready', preparedAt: '2026-09-12T07:00:00Z', payloadHash: 'a'.repeat(64) });
const savedReserve = (index: number) => ({ status: 'draft', webflowItemId: reserveItem(index).itemId,
  articleCheckpoint: { content: `Paid text ${index}`, preparedMedia: [{ url: 'hero' }, { url: 'body-1' }, { url: 'body-2' }] },
  preparationProof: { expected: { title: reserveItem(index).title, slug: reserveItem(index).slug } } });
function coverTodayAndTomorrow() {
  mocks.state.slots[today] = { itemId: 'today-published', token: 'fixture', state: 'published', leaseUntil: 0,
    attempts: 1, nextAttemptAt: 0 };
  mocks.state.entries.push({ ...reserveItem(9), kind: 'scheduled', scheduledDay: '2026-09-13', expiresDay: '2026-09-13' });
}

it('advances from one to three ready reserves and then the rest of the week without recovering existing stock', async () => {
  coverTodayAndTomorrow();
  for (let ready = 1; ready <= 3; ready++) {
    const index = ready - 1;
    mocks.state.entries.push(reserveItem(index));
    mocks.rows.set(`reserve-${reserveDays[index]}`, savedReserve(index));
    const before = structuredClone({ state: mocks.state, rows: [...mocks.rows] });
    await GET(request());
    expect(mocks.run).toHaveBeenLastCalledWith(expect.any(NextRequest), expect.objectContaining({
      dayKey: ready < 3 ? reserveDays[ready] : '2026-09-14', kind: ready < 3 ? 'reserve' : 'scheduled',
    }));
    expect({ state: mocks.state, rows: [...mocks.rows] }).toEqual(before);
  }
  expect(mocks.run).toHaveBeenCalledTimes(3);
  expect(mocks.admit).not.toHaveBeenCalled();
});
it.each(['selected', 'published', 'rejected'] as const)('preserves %s reserve work while selecting the next missing job', async state => {
  coverTodayAndTomorrow();
  mocks.state.entries.push({ ...reserveItem(0), state });
  mocks.rows.set(`reserve-${today}`, savedReserve(0));
  const before = structuredClone(mocks.state);
  await GET(request());
  expect(mocks.run).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ dayKey: '2026-09-13', kind: 'reserve' }));
  expect(mocks.admit).not.toHaveBeenCalled();
  expect(mocks.state).toEqual(before);
});
it('reaches later scheduled work when all reserve job IDs exist but fewer than three remain available', async () => {
  coverTodayAndTomorrow();
  const states = ['ready', 'selected', 'rejected'] as const;
  states.forEach((state, index) => {
    mocks.state.entries.push({ ...reserveItem(index), state });
    mocks.rows.set(`reserve-${reserveDays[index]}`, savedReserve(index));
  });
  const before = structuredClone({ state: mocks.state, rows: [...mocks.rows] });
  await GET(request());
  expect(mocks.run).toHaveBeenCalledTimes(1);
  expect(mocks.run).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ dayKey: '2026-09-14', kind: 'scheduled' }));
  expect(mocks.admit).not.toHaveBeenCalled();
  expect({ state: mocks.state, rows: [...mocks.rows] }).toEqual(before);
});
it('does not re-admit an editorially rejected reserve or let it block a later job', async () => {
  coverTodayAndTomorrow();
  mocks.state.entries.push({ ...reserveItem(0), decision: 'rejected' });
  mocks.rows.set(`reserve-${today}`, savedReserve(0));
  await GET(request());
  expect(mocks.run).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ dayKey: '2026-09-13', kind: 'reserve' }));
  expect(mocks.state.entries[1].decision).toBe('rejected');
  expect(mocks.admit).not.toHaveBeenCalled();
});
it('preserves an item owned by an ambiguous delivery slot even when its manifest entry is absent', async () => {
  coverTodayAndTomorrow();
  mocks.state.slots['2026-09-11'] = { ...mocks.state.slots[today], itemId: reserveItem(0).itemId, state: 'attempted' };
  mocks.rows.set(`reserve-${today}`, savedReserve(0));
  const before = structuredClone(mocks.state);
  await GET(request());
  expect(mocks.admit).not.toHaveBeenCalled();
  expect(mocks.run).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ dayKey: '2026-09-13', kind: 'reserve' }));
  expect(mocks.state).toEqual(before);
});
it('recovers an unadmitted paid CMS draft once, then advances past it on the next invocation', async () => {
  coverTodayAndTomorrow();
  mocks.rows.set(`reserve-${today}`, savedReserve(0));
  const before = structuredClone([...mocks.rows]);
  mocks.admit.mockImplementationOnce(async () => { mocks.state.entries.push(reserveItem(0)); });
  expect(await (await GET(request())).json()).toEqual({ status: 'recovered_ready_draft', day: today });
  expect(mocks.run).not.toHaveBeenCalled();
  await GET(request());
  expect(mocks.run).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ dayKey: '2026-09-13', kind: 'reserve' }));
  expect(mocks.admit).toHaveBeenCalledTimes(1);
  expect([...mocks.rows]).toEqual(before);
});
it.each(['no-op', 'failed'])('moves past %s admission without claiming recovery or regenerating its saved work', async outcome => {
  coverTodayAndTomorrow();
  mocks.rows.set(`reserve-${today}`, savedReserve(0));
  const before = structuredClone([...mocks.rows]);
  if (outcome === 'failed') mocks.admit.mockRejectedValueOnce(new Error('liv_preparation_cms_not_ready'));
  const response = await GET(request());
  expect((await response.json()).status).toBe('fixture');
  expect(mocks.run).toHaveBeenCalledTimes(1);
  expect(mocks.run).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ dayKey: '2026-09-13', kind: 'reserve' }));
  expect([...mocks.rows]).toEqual(before);
});
