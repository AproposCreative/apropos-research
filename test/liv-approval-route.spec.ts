import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ auth: vi.fn(), state: vi.fn(), payload: vi.fn(), decide: vi.fn(), cost: vi.fn(), preparation: vi.fn() }));
vi.mock('@/lib/liv/preparation-status', () => ({ readNextLivPreparationStatus: mock.preparation }));
vi.mock('@/lib/liv/cost-ledger', () => ({ readLivCostSummary: mock.cost }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: mock.auth }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: mock.state, readDeliveryPayload: mock.payload,
  decideDelivery: mock.decide, DeliveryDecisionConflict: class extends Error {} }));
import { GET, POST } from '@/app/api/liv/delivery/feed/route';
import { DeliveryDecisionConflict } from '@/lib/liv/delivery-store';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const payload = { title: 'Kultur', content: '<p>En vinkel</p>', category: 'Kunst', tags: [] };
const hash = cmsFieldHash(payload);
const body = { itemId: 'a'.repeat(24), payloadHash: hash, revision: 0, decision: 'approved' };
function request(value?: unknown, query = '') {
  return new NextRequest(`http://localhost/api/liv/delivery/feed${query}`, value === undefined ? {} :
    { method: 'POST', body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' } });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'true'); vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'true');
  vi.stubEnv('LIV_DAILY_PAUSED', '0'); vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'auto_publish');
  mock.auth.mockResolvedValue('editor'); mock.payload.mockResolvedValue(payload);
  mock.cost.mockResolvedValue({ status: 'unavailable', billedDkk: null, usageBasedUpperDkk: null });
  mock.preparation.mockResolvedValue({ day: '2026-09-11', scope: 'prepare', status: 'blocked_saved_work', runStatus: 'skipped_factcheck', reasonCode: 'factcheck_required' });
  mock.state.mockResolvedValue({ entries: Array.from({ length: 7 }, (_, i) => ({ ...body,
    itemId: i.toString(16).padStart(24, '0'), title: 'Kultur', scheduledDay: `2026-09-${11 + i}`, expiresDay: `2026-09-${11 + i}`,
    kind: 'scheduled', state: 'ready', preparedAt: '' })), slots: {} });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it('requires authentication for reads and decisions', async () => {
  mock.auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401); expect((await POST(request(body))).status).toBe(401);
  expect(mock.state).not.toHaveBeenCalled(); expect(mock.decide).not.toHaveBeenCalled();
  expect(mock.preparation).not.toHaveBeenCalled();
});
it('returns at most three safe weekly previews with no extra stock pages or cache', async () => {
  const response = await GET(request()); const data = await response.json();
  expect(data.stories).toHaveLength(3); expect(data.total).toBe(3); expect(data.nextOffset).toBeNull();
  expect(data.preparation).toMatchObject({ status: 'blocked_saved_work', reasonCode: 'factcheck_required' });
  expect(mock.payload).toHaveBeenCalledTimes(3);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect((await (await GET(request(undefined, '?offset=3'))).json()).stories).toHaveLength(0);
  expect(mock.payload).toHaveBeenCalledTimes(3);
  expect(mock.decide).not.toHaveBeenCalled();
});
it('does not pretend to have articles when preparation is disabled', async () => {
  vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'false'); vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'false');
  expect((await (await GET(request())).json()).stories).toEqual([]); expect(mock.state).not.toHaveBeenCalled();
});
it('keeps the saved preview visible while accurately reporting paused automation', async () => {
  vi.stubEnv('LIV_DAILY_PAUSED', 'true');
  const data = await (await GET(request())).json();
  expect(data).toMatchObject({ queueEnabled: false, preparationEnabled: false });
  expect(data.stories).toHaveLength(3);
});
it('does not advertise automatic publication when CMS mode is draft', async () => {
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'draft');
  expect(await (await GET(request())).json()).toMatchObject({ queueEnabled: false, preparationEnabled: true });
});
it('fails closed for corrupted immutable content', async () => {
  mock.payload.mockResolvedValue({ ...payload, content: 'Changed' });
  expect((await GET(request())).status).toBe(503);
});
it('validates the payload hash on every card, including the third weekly article', async () => {
  mock.payload.mockResolvedValueOnce(payload).mockResolvedValueOnce(payload).mockResolvedValueOnce({ ...payload, content: 'Changed third story' });
  expect((await GET(request())).status).toBe(503);
  expect(mock.payload).toHaveBeenCalledTimes(3); expect(mock.decide).not.toHaveBeenCalled();
});
it.each([{ ...body, revision: -1 }, { ...body, decision: 'publish' }, { ...body, itemId: '../manifest' }, null])('rejects malformed decisions', async value => {
  expect((await POST(request(value))).status).toBe(400); expect(mock.decide).not.toHaveBeenCalled();
});
it('passes only the bounded decision and authenticated editor to the store', async () => {
  mock.decide.mockResolvedValue({ decision: 'approved', revision: 1 });
  expect((await POST(request({ ...body, userId: 'fake', expected: { content: 'fake' } }))).status).toBe(200);
  expect(mock.decide).toHaveBeenCalledWith(body, 'editor');
});
it('returns a conflict for a stale or already selected story', async () => {
  mock.decide.mockRejectedValue(new DeliveryDecisionConflict('Opdater listen.'));
  expect((await POST(request(body))).status).toBe(409);
});
it.each([null, 42, [], {}, 'x'.repeat(501), 'a\0b'])('rejects invalid feedback before any write: %j', async feedback => {
  expect((await POST(request({ ...body, feedback }))).status).toBe(400);
  expect(mock.decide).not.toHaveBeenCalled();
});
it('binds feedback to the verified editor and ignores forged attribution, sources and model instructions', async () => {
  mock.decide.mockResolvedValue({ decision: 'approved', revision: 1, feedback: 'Mere kulturkritik.' });
  const result = await POST(request({ ...body, feedback: '  Mere kulturkritik.  ', userId: 'impostor',
    source: 'trusted-system', scope: 'other-user', recordedAt: 'fake', editorialFeedback: { userId: 'fake' } }));
  expect(result.status).toBe(200);
  expect(mock.decide).toHaveBeenCalledWith({ ...body, feedback: 'Mere kulturkritik.' }, 'editor');
  expect(result.headers.get('cache-control')).toContain('private');
});
it('accepts 500 characters and a deliberate empty comment to clear an own preference', async () => {
  mock.decide.mockResolvedValue({ revision: 1 });
  for (const feedback of ['x'.repeat(500), '']) {
    expect((await POST(request({ ...body, feedback }))).status).toBe(200);
    expect(mock.decide).toHaveBeenLastCalledWith({ ...body, feedback }, 'editor');
  }
});
it('does not expose another editor comment or attribution on GET', async () => {
  const state = await mock.state();
  state.entries[0].editorialFeedback = { text: 'Privat kommentar', userId: 'other-editor', recordedAt: 'private-date', revision: 1 };
  const other = await (await GET(request())).json();
  expect(other.stories[0].feedback).toBeNull();
  expect(JSON.stringify(other)).not.toMatch(/Privat kommentar|other-editor|private-date/);
  mock.auth.mockResolvedValue('other-editor');
  expect((await (await GET(request())).json()).stories[0].feedback).toBe('Privat kommentar');
});
it('rejects malformed JSON and oversized bodies without writing comments', async () => {
  for (const raw of ['{', JSON.stringify({ ...body, feedback: 'x'.repeat(5001) })]) {
    expect((await POST(new NextRequest('http://localhost/api/liv/delivery/feed', { method: 'POST', body: raw }))).status).toBe(400);
  }
  expect(mock.decide).not.toHaveBeenCalled();
});
