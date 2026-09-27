import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const store = vi.hoisted(() => ({ rows: new Map<string, any>(), brief: {} as any, queue: Promise.resolve() as Promise<unknown>, provider: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: store.provider }));
vi.mock('@/lib/liv/source-archive', () => ({ loadRecoverableWritingBrief: async () => structuredClone(store.brief) }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({ path, collection: (name: string) => collection(`${path}/${name}`),
    get: async () => ({ data: () => structuredClone(store.rows.get(path)) }) });
  const collection = (path: string): any => ({ doc: (id: string) => ref(`${path}/${id}`) });
  return { getAdminDb: () => ({ collection, runTransaction: (fn: any) => {
    const task = store.queue.then(async () => {
      const writes: Array<() => void> = [];
      const result = await fn({ get: async (r: any) => {
        if (writes.length) throw Error('read_after_write');
        return { data: () => structuredClone(store.rows.get(r.path)) };
      }, create: (r: any, row: any) => {
        if (store.rows.has(r.path)) throw Error('exists');
        writes.push(() => store.rows.set(r.path, row));
      }, set: (r: any, row: any, options: any) => writes.push(() => store.rows.set(r.path,
        options?.merge ? { ...store.rows.get(r.path), ...row } : row)) });
      writes.forEach(write => write()); return result;
    }); store.queue = task.catch(() => {}); return task;
  } }) };
});
import { editSavedLivWriting } from '@/lib/liv/edit-saved-writing';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const dayKey = '2026-09-27', writingRunId = '88209bcc-f7db-4e0b-81d3-d36534edc7dc';
const path = `livDailyArticles/reserve-${dayKey}`, desk = `livSourceArchives/${hash('liv-daily')}`;
const topic = 'En kulturhistorie', pointer = `${desk}/topics/${hash(topic.toLowerCase())}`;
const original = { status: 'ready', title: topic, subtitle: 'En konkret historie', intro: 'En introduktion.',
  content: 'Tidligere tekst. '.repeat(40), subjectType: 'culture', rating: null, ratingReason: null, missingEvidence: [] };
const input = { target: 'saved-writing', requestId: 'specific-copyedit', dayKey, scope: 'reserve', writingRunId,
  expectedRawHash: hash(JSON.stringify(original)), reason: 'Ny selvstændig vinkel efter kildekontrol.',
  replacement: { title: topic, subtitle: original.subtitle, intro: original.intro, content: 'Revideret tekst. '.repeat(40) } };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime('2026-09-27T10:00:00Z'); store.rows.clear(); store.queue = Promise.resolve(); store.provider.mockClear();
  store.brief = { runId: writingRunId, rawResponse: JSON.stringify(original), writerText: 'Gemte researchnoter',
    model: 'gpt-test', voiceVersion: 'saved-voice', articleFormat: 'article', finishReason: 'stop',
    sources: [{ url: 'https://example.org/evidence', contentHash: 'a'.repeat(64) }] };
  store.rows.set(`${desk}/runs/${writingRunId}`, { ...structuredClone(store.brief), tokenUsage: { input: 100, output: 200 } });
  store.rows.set(pointer, { latestBrief: structuredClone(store.brief), sourceIds: ['preserved'] });
  store.rows.set(path, { status: 'failed', topic, reason: 'source_similarity_unapproved: grounded failure', preparationAttempts: 1 });
  store.rows.set('livDelivery/manifest', { preparation: { token: 'lease', leaseUntil: Date.now() + 300000 }, slots: {}, entries: [] });
});
afterEach(() => { expect(store.provider).not.toHaveBeenCalled(); vi.useRealTimers(); });
it('preserves the parent, failure and evidence; a free operator child is not approval', async () => {
  const before = structuredClone(store.rows);
  const result = await editSavedLivWriting(input, 'lease');
  const child = store.rows.get(`${desk}/runs/${result.writingRunId}`);
  expect(child.operatorEdit).toMatchObject({ publicationApproval: false, authority: 'cron-authenticated-operator' });
  expect(child).toMatchObject({ status: 'not_verified', parentRunId: writingRunId, sources: store.brief.sources });
  expect(child.tokenUsage).toBeUndefined();
  expect(JSON.parse(child.rawResponse)).toEqual({ ...original, ...input.replacement, content: input.replacement.content.trim() });
  expect(store.rows.get(`${desk}/runs/${writingRunId}`)).toEqual(before.get(`${desk}/runs/${writingRunId}`));
  expect(store.rows.get(path)).toMatchObject(before.get(path));
  expect(store.rows.get(path).retryAuthorization).toBeUndefined();
  expect(store.rows.get('livDelivery/manifest')).toEqual(before.get('livDelivery/manifest'));
  expect(store.rows.get(pointer).sourceIds).toEqual(['preserved']);
});
it('replays without a second edit, and refuses changed request or a second copyedit', async () => {
  const result = await editSavedLivWriting(input, 'lease');
  const before = structuredClone([...store.rows]);
  expect(await editSavedLivWriting(input, 'lease')).toMatchObject({ status: 'already_edited', writingRunId: result.writingRunId });
  await expect(editSavedLivWriting({ ...input, reason: 'Ændret begrundelse for samme id' }, 'lease')).rejects.toThrow('conflict');
  await expect(editSavedLivWriting({ ...input, requestId: 'different-edit' }, 'lease')).rejects.toThrow('conflict');
  expect([...store.rows]).toEqual(before);
});
it('serializes concurrent requests into one archive child', async () => {
  const results = await Promise.all([editSavedLivWriting(input, 'lease'), editSavedLivWriting(input, 'lease')]);
  expect(results.map(r => r.status)).toEqual(['edited', 'already_edited']);
  expect(results[0].writingRunId).toBe(results[1].writingRunId);
});
it.each(['articleCheckpoint', 'articleCheckpointHash', 'webflowItemId', 'preparationProof', 'cmsSaveStarted', 'retryAuthorization', 'continuationReady', 'operatorWritingEdit'])(
  'cannot edit conflicting saved work %s', key => {
    store.rows.get(path)[key] = 'retained';
    return expect(editSavedLivWriting(input, 'lease')).rejects.toThrow('conflict');
  });
it.each(['processing', 'draft', 'published'])('cannot edit %s work', status => {
  store.rows.get(path).status = status;
  return expect(editSavedLivWriting(input, 'lease')).rejects.toThrow('conflict');
});
it('keeps dependency failures closed and rejects stale hash, pointer, lease or dates', async () => {
  store.rows.get(path).reason = 'liv_cost_provider_quota_exhausted';
  await expect(editSavedLivWriting(input, 'lease')).rejects.toThrow('conflict');
  store.rows.get(path).reason = 'source_similarity_unapproved: failure';
  await expect(editSavedLivWriting({ ...input, expectedRawHash: 'a'.repeat(64) }, 'lease')).rejects.toThrow('conflict');
  await expect(editSavedLivWriting(input, 'expired')).rejects.toThrow('lease_lost');
  await expect(editSavedLivWriting({ ...input, dayKey: '2026-09-26' }, 'lease')).rejects.toThrow('invalid');
  store.rows.get(pointer).latestBrief.runId = 'another';
  await expect(editSavedLivWriting(input, 'lease')).rejects.toThrow('conflict');
});
