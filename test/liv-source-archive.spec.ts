import { beforeEach, expect, it, vi } from 'vitest';
import { archiveSourceRecord, recalledSourceUrls, rememberResearchSources } from '@/lib/liv/source-archive';
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
