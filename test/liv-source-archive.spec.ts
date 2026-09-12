import { beforeEach, expect, it, vi } from 'vitest';
import { archiveSourceRecord, recalledSourceUrls, rememberResearchSources, rememberWritingBrief, readWritingBrief, loadRecoverableWritingBrief } from '@/lib/liv/source-archive';
import type { RetrievedSource } from '@/lib/factcheck/source-reader';

const state = vi.hoisted(() => ({ data: new Map<string, Record<string, unknown>>(), available: true }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({ path, collection: (name: string) => ref(`${path}/${name}`), doc: (id: string) => ref(`${path}/${id}`),
    get: async () => ({ data: () => state.data.get(path) }) });
  return { getAdminDb: () => state.available ? { collection: (name: string) => ref(name),
    runTransaction: async (callback: any) => callback({ get: (r: any) => r.get(), set: (r: any, row: any, options?: { merge?: boolean }) =>
      state.data.set(r.path, options?.merge ? { ...state.data.get(r.path), ...row } : row) }) } : null };
});
beforeEach(() => { state.data.clear(); state.available = true; });
const source: RetrievedSource = { id: 'S1', title: 'The Invite', url: 'https://example.com/film?utm_source=feed', text: 'Læsbar tekst '.repeat(100), contentHash: 'hash', retrievedAt: '2026-09-09T18:00:00Z', publishedAt: null };
const runId = '11111111-1111-4111-8111-111111111111';

it('stores bounded metadata, not a full article or automatic trust verdict', () => {
  const row = archiveSourceRecord(source);
  expect(row.snippet.length).toBe(300);
  expect(row.verificationStatus).toBe('retrieved_not_verified');
  expect(row).not.toHaveProperty('text');
  expect(row.id).toBe(archiveSourceRecord({ ...source, url: 'https://example.com/film' }).id);
});
it('rejects credential-bearing and private URL formats', () => {
  expect(() => archiveSourceRecord({ ...source, url: 'https://example.com/?access_token=example' })).toThrow();
  expect(() => archiveSourceRecord({ ...source, url: 'https://127.0.0.1/' })).toThrow();
});
it('recalls leads within the same desk, updates rather than duplicates and preserves firstSeenAt', async () => {
  await rememberResearchSources('editor-one', 'The Invite', [source]);
  const later = { ...source, retrievedAt: '2026-09-10T18:00:00Z', url: 'https://example.com/film', contentHash: 'new-hash' };
  await rememberResearchSources('editor-one', 'THE INVITE!', [later]);
  const sources = [...state.data.entries()].filter(([path]) => path.includes('/sources/'));
  expect(sources).toHaveLength(1);
  expect(sources[0][1].firstSeenAt).toBe(source.retrievedAt);
  expect(sources[0][1].contentHash).toBe('new-hash');
  expect(await recalledSourceUrls('editor-one', 'The Invite')).toEqual([later.url]);
  expect(await recalledSourceUrls('editor-two', 'The Invite')).toEqual([]);
  expect([...state.data.values()].some(row => row.status === 'discovered')).toBe(true);
});
it('fails explicitly when history cannot be stored or recalled', async () => {
  state.available = false;
  await expect(rememberResearchSources('u', 't', [source])).rejects.toThrow('source_archive_unavailable');
  await expect(recalledSourceUrls('u', 't')).rejects.toThrow('source_archive_unavailable');
});

it('keeps the latest neutral brief and missing evidence in its own scope without erasing source references', async () => {
  await rememberResearchSources('editor-one', 'The Invite', [source]);
  await rememberWritingBrief('editor-one', 'The Invite', { runId, writerText: '[S1] En neutral faktanote.', model: 'model', voiceVersion: 'liv-v4', rawResponse: '{"status":"insufficient_evidence"}', tokenUsage: { input: 200, output: 300 } });
  await rememberWritingBrief('editor-one', 'The Invite', { runId, writerText: '[S1] En neutral faktanote.', model: 'model', voiceVersion: 'liv-v4', missingEvidence: ['Der mangler en konkret scene.'] });
  const rows = [...state.data.entries()].filter(([path]) => path.includes('/topics/'));
  expect(rows).toHaveLength(1);
  expect(rows[0][1]).toMatchObject({ sourceIds: expect.any(Array), latestBrief: { status: 'insufficient_evidence', missingEvidence: ['Der mangler en konkret scene.'], textHash: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  expect(JSON.stringify(rows[0][1])).not.toContain(source.text);
  expect(await recalledSourceUrls('editor-two', 'The Invite')).toEqual([]);
  expect(await recalledSourceUrls('editor-one', 'The Invite')).toEqual(['https://example.com/film']);
  expect(await readWritingBrief('editor-one', runId)).toMatchObject({ tokenUsage: { input: 200, output: 300 }, rawResponse: '{"status":"insufficient_evidence"}' });
  expect(await readWritingBrief('editor-two', runId)).toBeNull();
  expect(await readWritingBrief('editor-one', '../private')).toBeNull();
});
it('rejects oversized or unpersistable diagnostics', async () => {
  await expect(rememberWritingBrief('u', 't', { runId, writerText: 'x'.repeat(24001), model: 'm', voiceVersion: 'v' })).rejects.toThrow();
  state.available = false;
  await expect(rememberWritingBrief('u', 't', { runId, writerText: 'notes', model: 'm', voiceVersion: 'v' })).rejects.toThrow('source_archive_unavailable');
});

const paidRunId = '4f5f2284-420d-4622-ac68-b42c0bc18ffd';
const paidSource = { id: 'S1', url: 'https://example.com/film', contentHash: 'a'.repeat(64),
  retrievedAt: '2026-09-12T08:00:00.000Z', publishedAt: null };
// Synthetic draft: never fetch the real production run in these tests.
const paidBrief = { runId: paidRunId, writerText: '[S1] En neutral faktanote.', model: 'gpt-5.6-luna', voiceVersion: 'liv-v4',
  rawResponse: '  {"status":"ready","content":"Syntetisk betalt udkast"}\n', sources: [paidSource] };
const seedPaid = async () => rememberWritingBrief('liv-daily', 'Dagens emne', paidBrief);
const savedRun = () => [...state.data.entries()].find(([path]) => path.endsWith(`/runs/${paidRunId}`))![1];

it('retains the chosen format with paid output and rejects later reclassification', async () => {
  await rememberWritingBrief('liv-daily', 'Dagens emne', { ...paidBrief, articleFormat: 'research-review' });
  expect((await loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).articleFormat).toBe('research-review');
  await expect(rememberWritingBrief('liv-daily', 'Dagens emne', { ...paidBrief, articleFormat: 'article' }))
    .rejects.toThrow('research_recovery_conflict');
  savedRun().articleFormat = 'review';
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_invalid');
});

it('loads the exact scoped paid response and metadata without inventing finish evidence or source text', async () => {
  await seedPaid();
  const before = structuredClone([...state.data]);
  expect(await loadRecoverableWritingBrief('liv-daily', 'DAGENS EMNE!', paidRunId)).toEqual(paidBrief);
  expect(await loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).not.toHaveProperty('finishReason');
  expect(await loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).not.toHaveProperty('refusal');
  expect([...state.data]).toEqual(before);
});
it('preserves the latest brief pointer when source discovery refreshes the topic', async () => {
  await seedPaid();
  const latestBefore = structuredClone([...state.data.values()].find(row => row.latestBrief)?.latestBrief);
  await rememberResearchSources('liv-daily', 'Dagens emne', [{ ...source, contentHash: 'b'.repeat(64) }]);
  expect([...state.data.values()].find(row => row.latestBrief)?.latestBrief).toEqual(latestBefore);
  expect((await loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).sources).toEqual([paidSource]);
});
it.each(['scope', 'topic', 'latest'])('rejects a %s mismatch without falling back to another archive run', async mismatch => {
  await seedPaid();
  if (mismatch === 'latest') await rememberWritingBrief('liv-daily', 'Dagens emne', { ...paidBrief, runId });
  await expect(loadRecoverableWritingBrief(mismatch === 'scope' ? 'editor-other' : 'liv-daily',
    mismatch === 'topic' ? 'Et andet emne' : 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_conflict');
});
it('distinguishes a missing pointed run from a mismatched stored run identity', async () => {
  await seedPaid();
  savedRun().runId = runId;
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_conflict');
  const path = [...state.data.keys()].find(path => path.endsWith(`/runs/${paidRunId}`))!;
  state.data.delete(path);
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_missing');
});
it.each(['../private', '-'.repeat(36), '111111111111-4111-8111-111111111111', ''])('rejects malformed recovery run ID %s', async badId => {
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', badId)).rejects.toThrow('research_recovery_invalid');
});
it.each([
  ['rawResponse', ''], ['rawResponse', 'x'.repeat(60001)], ['rawResponse', {}],
  ['writerText', ' '], ['writerText', 'x'.repeat(24001)], ['writerText', null],
  ['model', ''], ['model', 'x'.repeat(121)], ['model', 'model\nunsafe'],
  ['voiceVersion', ''], ['voiceVersion', {}],
  ['sources', []], ['sources', Array(9).fill(paidSource)], ['sources', null],
  ['finishReason', 'unknown'], ['finishReason', true], ['refusal', {}],
  ['parentRunId', paidRunId], ['parentRunId', 'invalid'],
] as const)('rejects invalid archived %s', async (key, value) => {
  await seedPaid();
  savedRun()[key] = value;
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_invalid');
});
it.each([
  { url: 'https://127.0.0.1/film' }, { url: 'http://example.com/film' },
  { url: 'https://user:secret@example.com/film' }, { url: 'https://example.com/film?access_token=secret' },
  { url: 'https://example.com/film?apiKey=secret' }, { url: 'https://example.local/film' },
  { contentHash: 'incorrect' }, { id: 'S9' }, { retrievedAt: 'not-a-date' }, { publishedAt: 'not-a-date' },
])('rejects unsafe or malformed source metadata %j', async patch => {
  await seedPaid();
  savedRun().sources = [{ ...paidSource, ...patch }];
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_invalid');
});
it('rejects duplicate source identities or URLs instead of silently dropping them', async () => {
  await seedPaid();
  savedRun().sources = [paidSource, { ...paidSource, url: 'https://other.example.com/film' }];
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_invalid');
  savedRun().sources = [paidSource, { ...paidSource, id: 'S2' }];
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_invalid');
});
it.each(['stop', 'length', 'content_filter', null] as const)('returns actual recorded finish evidence unchanged: %s', async finishReason => {
  await rememberWritingBrief('liv-daily', 'Dagens emne', { ...paidBrief, finishReason, refusal: null });
  expect(await loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).toMatchObject({ finishReason, refusal: null });
});
it('retains a provider refusal as evidence, not an approval', async () => {
  await rememberWritingBrief('liv-daily', 'Dagens emne', { ...paidBrief, finishReason: 'stop', refusal: 'Declined' });
  expect(await loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).toMatchObject({ refusal: 'Declined' });
});
it('writes a new linked rewrite run while preserving the entire original paid record', async () => {
  await seedPaid();
  const original = structuredClone(savedRun());
  const child = { ...paidBrief, runId, parentRunId: paidRunId, rawResponse: '{"content":"Revideret udkast"}' };
  await rememberWritingBrief('liv-daily', 'Dagens emne', child);
  expect(savedRun()).toEqual(original);
  expect(await loadRecoverableWritingBrief('liv-daily', 'Dagens emne', runId)).toEqual(child);
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('research_recovery_conflict');
  await expect(rememberWritingBrief('liv-daily', 'Dagens emne', { ...child, rawResponse: 'Replacement' })).rejects.toThrow('research_recovery_conflict');
  expect(savedRun()).toEqual(original);
});
it('allows idempotent raw replay and diagnostic updates but rejects changing paid provenance', async () => {
  await seedPaid();
  await seedPaid();
  await rememberWritingBrief('liv-daily', 'Dagens emne', { runId: paidRunId, writerText: paidBrief.writerText,
    model: paidBrief.model, voiceVersion: paidBrief.voiceVersion, missingEvidence: ['Omskriv det konkrete kildeoverlap.'] });
  expect((await readWritingBrief('liv-daily', paidRunId))?.rawResponse).toBe(paidBrief.rawResponse);
  for (const patch of [{ rawResponse: 'Replacement' }, { model: 'different-model' }, { writerText: 'Changed notes' },
    { sources: [{ ...paidSource, contentHash: 'b'.repeat(64) }] }, { finishReason: 'stop' as const }]) {
    await expect(rememberWritingBrief('liv-daily', 'Dagens emne', { ...paidBrief, ...patch })).rejects.toThrow('research_recovery_conflict');
  }
});
it('validates parent identity and requires the parent to be the latest paid run for this topic and scope', async () => {
  await seedPaid();
  await expect(rememberWritingBrief('liv-daily', 'Dagens emne', { ...paidBrief, parentRunId: paidRunId })).rejects.toThrow('research_diagnostic_invalid');
  await expect(rememberWritingBrief('liv-daily', 'Dagens emne', { ...paidBrief, runId, parentRunId: 'invalid' })).rejects.toThrow('research_diagnostic_invalid');
  const child = { ...paidBrief, runId, parentRunId: paidRunId };
  await expect(rememberWritingBrief('other-editor', 'Dagens emne', child)).rejects.toThrow('research_recovery_conflict');
  await expect(rememberWritingBrief('liv-daily', 'Andet emne', child)).rejects.toThrow('research_recovery_conflict');
  expect([...state.data.keys()].filter(path => path.includes('/runs/'))).toHaveLength(1);
});
it('reports unavailable storage separately from recovery conflicts', async () => {
  state.available = false;
  await expect(loadRecoverableWritingBrief('liv-daily', 'Dagens emne', paidRunId)).rejects.toThrow('source_archive_unavailable');
});
