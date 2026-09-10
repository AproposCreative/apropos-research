import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ auth: vi.fn(), state: vi.fn(), payload: vi.fn(), decide: vi.fn() }));
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
  mock.auth.mockResolvedValue('editor'); mock.payload.mockResolvedValue(payload);
  mock.state.mockResolvedValue({ entries: Array.from({ length: 7 }, (_, i) => ({ ...body,
    itemId: i.toString(16).padStart(24, '0'), title: 'Kultur', scheduledDay: `2026-09-${11 + i}`, expiresDay: `2026-09-${11 + i}`,
    kind: 'scheduled', state: 'ready', preparedAt: '' })), slots: {} });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it('requires authentication for reads and decisions', async () => {
  mock.auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401); expect((await POST(request(body))).status).toBe(401);
  expect(mock.state).not.toHaveBeenCalled(); expect(mock.decide).not.toHaveBeenCalled();
});
it('returns exactly five safe previews, then the remaining two, without cache', async () => {
  const response = await GET(request()); const data = await response.json();
  expect(data.stories).toHaveLength(5); expect(data.nextOffset).toBe(5);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect((await (await GET(request(undefined, '?offset=5'))).json()).stories).toHaveLength(2);
});
it('does not pretend to have articles when preparation is disabled', async () => {
  vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'false'); vi.stubEnv('LIV_DELIVERY_PREPARE_ENABLED', 'false');
  expect((await (await GET(request())).json()).stories).toEqual([]); expect(mock.state).not.toHaveBeenCalled();
});
it('fails closed for corrupted immutable content', async () => {
  mock.payload.mockResolvedValue({ ...payload, content: 'Changed' });
  expect((await GET(request())).status).toBe(503);
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
