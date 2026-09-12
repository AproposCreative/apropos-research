import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), writes: vi.fn(), txHook: undefined as undefined | (() => void),
  queue: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({ path, id: path.split('/').pop(), collection: (name: string) => ref(`${path}/${name}`),
    doc: (id: string) => ref(`${path}/${id}`), get: async () => ({ exists: state.rows.has(path), data: () => structuredClone(state.rows.get(path)) }) });
  return { getAdminDb: () => ({ collection: (name: string) => ref(name), runTransaction: (run: any) => {
    const task = state.queue.catch(() => {}).then(async () => {
      state.txHook?.();
      const writes: Array<[string, any, boolean]> = [];
      const result = await run({ get: (r: any) => r.get(),
        create: (r: any, value: any) => { if (state.rows.has(r.path)) throw new Error('exists'); writes.push([r.path, value, false]); },
        set: (r: any, value: any, opts: any) => writes.push([r.path, value, !!opts?.merge]),
      });
      for (const [path, value, merge] of writes) { state.writes(path); state.rows.set(path, merge ? { ...state.rows.get(path), ...value } : value); }
      return result;
    }); state.queue = task; return task;
  } }) };
});
import { authorizePreparationRetry } from '@/lib/liv/retry-preparation';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const runId = '22f6a890-794f-4041-84da-5ce28b5336d9'; // ID only; all data below is synthetic, never fetched live.
const original = { requestId: 'tv-review-original', dayKey: '2026-09-12', topicHint: 'The Gentlemen sæson 2',
  directiveHint: 'Review the documented TV series with official press photos.', articleFormat: 'research-review' };
const input = { dayKey: original.dayKey, kind: 'reserve' as const, scope: 'reserve-editorial' as const,
  requestId: 'semantic-fix-retry-1', reason: 'Recheck exact saved work after semantic adjudication fix.', resumeWritingRunId: runId };
const path = `livDailyArticles/reserve-editorial-${input.dayKey}`;
const reservation = `livExplicitPreparations/reserve-editorial-${input.dayKey}`;
const desk = `livSourceArchives/${hash('liv-daily')}`;
const writerPath = `${desk}/runs/${runId}`;
const pointer = `${desk}/topics/${hash(original.topicHint.toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu, ' ').trim())}`;
const audit = `${path}/retryRequests/${hash(input.requestId)}`;
const raw = JSON.stringify({ status: 'ready', title: 'Saved TV review', subtitle: 'An independent verdict', intro: 'Saved intro',
  content: 'Exact saved paid article content.', subjectType: 'tv-series', rating: 4,
  ratingReason: 'The documented strengths outweigh the specific weaknesses.' });
beforeEach(() => {
  state.rows.clear(); state.writes.mockClear(); state.txHook = undefined; state.queue = Promise.resolve();
  state.rows.set(reservation, { input: original, inputHash: cmsFieldHash(original), createdAt: 'saved' });
  state.rows.set(path, { dayKey: input.dayKey, explicitPreparationInputHash: cmsFieldHash(original), status: 'failed',
    topic: original.topicHint, preparationAttempts: 1, reason: 'source_similarity_unapproved: original diagnostic retained' });
  state.rows.set(writerPath, { runId, writerText: '[S1] Saved source notes.', rawResponse: raw, articleFormat: 'research-review',
    model: 'saved-model', voiceVersion: 'liv-v4', finishReason: 'stop', refusal: null,
    sources: [{ id: 'S1', url: 'https://example.com/real-source', contentHash: 'a'.repeat(64),
      retrievedAt: '2026-09-12T10:00:00Z', publishedAt: '2026-09-11T10:00:00Z' }] });
  state.rows.set(pointer, { latestBrief: { runId } });
  state.rows.set('livDelivery/manifest', { preparation: { token: 'lease', leaseUntil: Date.now() + 360000 }, slots: {} });
  state.rows.set('livDailyPlan/plan-2026-09-12', { topicHint: 'Published story', articleFormat: 'article' });
  state.rows.set('livDailyArticles/reserve-2026-09-12', { status: 'failed', topic: 'Other reserve' });
  state.rows.set('livDailyArticles/prepare-2026-09-13', { status: 'failed', topic: 'Oasis', preparationAttempts: 5 });
});

it('audits one exact paid-writing retry, preserves every saved artifact and returns only its immutable reserved plan', async () => {
  const before = structuredClone([...state.rows]);
  expect(await authorizePreparationRetry(input, 'lease')).toEqual({ status: 'retry_authorized', defaultPlan: {
    dayKey: original.dayKey, topicHint: original.topicHint, directiveHint: original.directiveHint,
    articleFormat: 'research-review', mustUseTrending: false, status: 'pending', createdAt: null, updatedAt: null } });
  expect(state.rows.get(audit)).toMatchObject({ previous: Object.fromEntries(before)[path], resumeWritingRunId: runId,
    writingEvidenceHash: expect.any(String), explicitPreparationInputHash: cmsFieldHash(original), retryInputHash: cmsFieldHash(input) });
  expect(state.rows.get(path)).toMatchObject({ status: 'failed', preparationAttempts: 1, resumeWritingRunId: runId,
    retryAuthorization: hash(input.requestId), reason: 'source_similarity_unapproved: original diagnostic retained' });
  for (const [key, value] of before) if (key !== path) expect(state.rows.get(key)).toEqual(value);
  expect(state.writes.mock.calls.map(call => call[0])).toEqual([audit, path]);
  expect(await authorizePreparationRetry(input, 'lease')).toEqual({ status: 'already_requested' });
  expect(state.writes).toHaveBeenCalledTimes(2);
});

it.each(['reason', 'resumeWritingRunId'])('rejects changed %s under the same audited request ID', async key => {
  await authorizePreparationRetry(input, 'lease'); state.writes.mockClear();
  await expect(authorizePreparationRetry({ ...input, [key]: key === 'reason' ? 'Changed reason' : '11111111-1111-4111-8111-111111111111' }, 'lease'))
    .rejects.toThrow('conflict');
  expect(state.writes).not.toHaveBeenCalled();
});

it.each(['ownership', 'reservation', 'checkpoint', 'checkpoint-hash', 'cms', 'proof', 'cms-started', 'grant', 'continuation', 'processing', 'other-failure',
  'missing-writer', 'wrong-pointer', 'changed-format', 'missing-format', 'truncated', 'refused', 'invalid-raw', 'unsafe-source', 'missing-lease', 'cover', 'attempted'])(
  'rejects unsafe recovery without granting a retry: %s', async kind => {
    const row = state.rows.get(path), writer = state.rows.get(writerPath), manifest = state.rows.get('livDelivery/manifest');
    if (kind === 'ownership') row.explicitPreparationInputHash = 'changed';
    if (kind === 'reservation') state.rows.set(reservation, { input: { ...original, topicHint: 'Other work' }, inputHash: cmsFieldHash(original) });
    if (kind === 'checkpoint') row.articleCheckpoint = { content: 'paid' };
    if (kind === 'checkpoint-hash') row.articleCheckpointHash = 'a'.repeat(64);
    if (kind === 'cms') row.webflowItemId = 'known';
    if (kind === 'proof') row.preparationProof = {};
    if (kind === 'cms-started') row.cmsSaveStarted = true;
    if (kind === 'grant') row.retryAuthorization = 'existing';
    if (kind === 'continuation') row.continuationReady = true;
    if (kind === 'processing') row.status = 'processing';
    if (kind === 'other-failure') row.reason = 'article_evidence_insufficient';
    if (kind === 'missing-writer') state.rows.delete(writerPath);
    if (kind === 'wrong-pointer') state.rows.set(pointer, { latestBrief: { runId: 'other' } });
    if (kind === 'changed-format') writer.articleFormat = 'article';
    if (kind === 'missing-format') delete writer.articleFormat;
    if (kind === 'truncated') writer.finishReason = 'length';
    if (kind === 'refused') writer.refusal = 'refused';
    if (kind === 'invalid-raw') writer.rawResponse = '{}';
    if (kind === 'unsafe-source') writer.sources[0].url = 'http://127.0.0.1/';
    if (kind === 'missing-lease') delete manifest.preparation;
    if (kind === 'cover') manifest.coverRevision = { id: 'hold' };
    if (kind === 'attempted') manifest.slots[original.dayKey] = { state: 'attempted' };
    await expect(authorizePreparationRetry(input, 'lease')).rejects.toThrow();
    expect(state.writes).not.toHaveBeenCalled();
  });

it('rejects a concurrently changed writer archive before the authorization transaction commits', async () => {
  let transactions = 0;
  state.txHook = () => { if (++transactions === 2) state.rows.get(writerPath).rawResponse = raw.replace('Exact saved', 'Changed saved'); };
  await expect(authorizePreparationRetry(input, 'lease')).rejects.toThrow('conflict');
  expect(state.writes).not.toHaveBeenCalled();
});

it.each([
  { ...input, resumeWritingRunId: undefined }, { ...input, kind: 'scheduled' },
  { ...input, plan: { topicHint: 'Other', directiveHint: 'Other' } },
  { ...input, similarityOverride: true }, { ...input, skipGates: true },
])('rejects changed plans, missing writer pointers and any proposed bypass', async invalid => {
  await expect(authorizePreparationRetry(invalid as typeof input, 'lease')).rejects.toThrow('invalid');
  expect(state.writes).not.toHaveBeenCalled();
});
