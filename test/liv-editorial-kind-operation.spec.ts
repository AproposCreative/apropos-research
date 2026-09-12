import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), writes: vi.fn(), available: true,
  tail: Promise.resolve() as Promise<unknown>, env: { CRON_SECRET: 'fixture-secret' } }));
vi.mock('@/lib/config/env', () => ({ env: state.env }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({ path, collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }) });
  return { getAdminDb: () => state.available ? { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (fn: any) => {
      const task = state.tail.then(async () => {
        const writes: Array<() => void> = [];
        const result = await fn({
          get: async (r: any) => { if (writes.length) throw new Error('read_after_write'); return { data: () => structuredClone(state.rows.get(r.path)) }; },
          create: (r: any, value: any) => { if (state.rows.has(r.path)) throw new Error('exists');
            writes.push(() => { state.rows.set(r.path, structuredClone(value)); state.writes(r.path); }); },
          set: (r: any, value: any) => writes.push(() => { state.rows.set(r.path, structuredClone(value)); state.writes(r.path); }),
        }); writes.forEach(write => write()); return result;
      }); state.tail = task.catch(() => undefined); return task;
    },
  } : null };
});
import { POST } from '@/app/api/liv/operations/editorial-kind/route';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { approvalStory } from '@/lib/liv/approval-feed';

const itemId = 'a'.repeat(24), itemPath = `livDelivery/item-${itemId}`;
const payload = { title: 'En kulturhistorie', slug: 'kultur', content: '<p>Gemt tekst.</p>', articleFormat: 'article', category: 'Kultur' };
const input = { requestId: 'kind-fixture-1', itemId, payloadHash: cmsFieldHash(payload), editorialKind: 'feature', reason: 'Explicit editorial selection.' };
const request = (body: unknown = input, auth = 'Bearer fixture-secret', query = '') => new NextRequest(`https://example.test/api/liv/operations/editorial-kind${query}`, {
  method: 'POST', headers: { authorization: auth }, body: JSON.stringify(body),
});
beforeEach(() => {
  state.rows.clear(); state.writes.mockClear(); state.available = true; state.tail = Promise.resolve(); state.env.CRON_SECRET = 'fixture-secret';
  state.rows.set(itemPath, { expected: payload, payloadHash: input.payloadHash });
  state.rows.set('livDelivery/manifest', { entries: [{ itemId, payloadHash: input.payloadHash, title: payload.title, slug: payload.slug,
    state: 'ready', kind: 'scheduled', scheduledDay: '2026-09-15', expiresDay: '2026-09-15', preparedAt: 'saved',
    planHash: 'b'.repeat(64), decision: 'approved', decisionRevision: 3 }], slots: {} });
  state.rows.set('livDailyArticles/prepare-2026-09-15', { articleCheckpoint: 'paid work', preparationProof: 'unchanged' });
});
it.each([['feature', 'Feature'], ['culture-story', 'Kulturhistorie']])('audits explicit %s without changing payloads, proofs or decisions', async (editorialKind, formatLabel) => {
  const before = structuredClone([...state.rows]);
  const response = await POST(request({ ...input, editorialKind }));
  expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  const entry = state.rows.get('livDelivery/manifest').entries[0];
  expect(entry).toEqual({ ...Object.fromEntries(before)['livDelivery/manifest'].entries[0], editorialKind });
  for (const [path, row] of before) if (path !== 'livDelivery/manifest') expect(state.rows.get(path)).toEqual(row);
  expect(state.rows.get(`${itemPath}/editorialKinds/${input.requestId}`)).toMatchObject({
    input: { ...input, editorialKind }, previousEditorialKind: null, authority: 'cron-authenticated-operator' });
  expect(state.writes.mock.calls.map(call => call[0])).toEqual([`${itemPath}/editorialKinds/${input.requestId}`, 'livDelivery/manifest']);
  expect(approvalStory(entry, payload as any)).toMatchObject({ formatLabel, rating: null, payloadHash: input.payloadHash });
});
it('serializes exact replay, preserves immutable audits and never reapplies an old label', async () => {
  const responses = await Promise.all([POST(request()), POST(request())]);
  expect((await Promise.all(responses.map(response => response.json()))).map(row => row.status)).toEqual(['recorded', 'already_recorded']);
  expect(state.writes).toHaveBeenCalledTimes(2);
  const audit = structuredClone(state.rows.get(`${itemPath}/editorialKinds/${input.requestId}`));
  expect((await POST(request({ ...input, requestId: 'kind-fixture-2', editorialKind: 'culture-story' }))).status).toBe(200);
  state.writes.mockClear(); expect((await POST(request())).status).toBe(200);
  expect(state.writes).not.toHaveBeenCalled();
  expect(state.rows.get('livDelivery/manifest').entries[0].editorialKind).toBe('culture-story');
  expect(state.rows.get(`${itemPath}/editorialKinds/${input.requestId}`)).toEqual(audit);
});
it.each(['editorialKind', 'reason', 'payloadHash'])('rejects changed %s under the same request ID', async field => {
  await POST(request()); state.writes.mockClear();
  const changed = field === 'editorialKind' ? 'culture-story' : field === 'payloadHash' ? 'c'.repeat(64) : 'Different reason';
  expect((await POST(request({ ...input, [field]: changed }))).status).toBe(409);
  expect(state.writes).not.toHaveBeenCalled();
});
it.each(['selected', 'published', 'rejected', 'missing', 'duplicate', 'slot', 'cover', 'payload', 'hash', 'review', 'unknown-format'])('blocks unsafe %s state without writes', async kind => {
  const manifest = state.rows.get('livDelivery/manifest');
  if (['selected', 'published', 'rejected'].includes(kind)) manifest.entries[0].state = kind;
  if (kind === 'missing') manifest.entries = [];
  if (kind === 'duplicate') manifest.entries.push(structuredClone(manifest.entries[0]));
  if (kind === 'slot') manifest.slots['2026-09-15'] = { itemId, state: 'attempted' };
  if (kind === 'cover') manifest.coverRevision = { itemId };
  if (kind === 'payload') state.rows.get(itemPath).expected = { ...payload, content: 'changed' };
  if (kind === 'hash') manifest.entries[0].payloadHash = 'c'.repeat(64);
  let body = input;
  if (kind === 'review' || kind === 'unknown-format') {
    const expected = { ...payload, articleFormat: kind === 'review' ? 'research-review' : undefined };
    const payloadHash = cmsFieldHash(expected);
    state.rows.set(itemPath, { expected, payloadHash }); manifest.entries[0].payloadHash = payloadHash; body = { ...input, payloadHash };
  }
  const before = structuredClone([...state.rows]);
  expect((await POST(request(body))).status).toBe(409);
  expect([...state.rows]).toEqual(before); expect(state.writes).not.toHaveBeenCalled();
});
it.each([{ editorialKind: 'review' }, { editorialKind: 'Feature' }, { editorialKind: null }, { itemId: '../bad' },
  { payloadHash: 'invalid' }, { requestId: 'short' }, { content: 'new' }, { reason: '<script>bad</script>' }])('rejects invalid input %j', async patch => {
  expect((await POST(request({ ...input, ...patch }))).status).toBe(400); expect(state.writes).not.toHaveBeenCalled();
});
it('rejects query overrides, oversized input, absent/wrong auth and unavailable storage', async () => {
  expect((await POST(request(input, 'Bearer fixture-secret', '?publish=1'))).status).toBe(400);
  expect((await POST(request({ ...input, reason: 'x'.repeat(2100) }))).status).toBe(400);
  expect((await POST(request(input, ''))).status).toBe(403); expect((await POST(request(input, 'Bearer wrong'))).status).toBe(403);
  state.env.CRON_SECRET = ''; expect((await POST(request())).status).toBe(503);
  state.env.CRON_SECRET = 'fixture-secret'; state.available = false; expect((await POST(request())).status).toBe(503);
  expect(state.writes).not.toHaveBeenCalled();
});
