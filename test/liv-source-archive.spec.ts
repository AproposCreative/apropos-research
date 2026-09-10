import { beforeEach, expect, it, vi } from 'vitest';
import { archiveSourceRecord, recalledSourceUrls, rememberResearchSources, rememberWritingBrief, readWritingBrief } from '@/lib/liv/source-archive';
import type { RetrievedSource } from '@/lib/factcheck/source-reader';

const state = vi.hoisted(() => ({ data: new Map<string, Record<string, unknown>>(), available: true }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({ path, collection: (name: string) => ref(`${path}/${name}`), doc: (id: string) => ref(`${path}/${id}`),
    get: async () => ({ data: () => state.data.get(path) }) });
  return { getAdminDb: () => state.available ? { collection: (name: string) => ref(name),
    runTransaction: async (callback: any) => callback({ get: (r: any) => r.get(), set: (r: any, row: any) => state.data.set(r.path, { ...state.data.get(r.path), ...row }) }) } : null };
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
