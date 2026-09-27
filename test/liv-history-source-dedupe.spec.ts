import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const state = vi.hoisted(() => ({ rows: [] as any[], docs: new Map<string, any>(), paths: [] as string[], limits: [] as number[], fail: false, available: true }));
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({ collection: (name: string) => collection(`${path}/${name}`), get: async () => {
    if (state.fail) throw Error('private error'); state.paths.push(path); return { data: () => state.docs.get(path) };
  } });
  const collection = (path: string): any => ({ doc: (id: string) => ref(`${path}/${id}`), orderBy: () => ({ limit: (n: number) => {
    state.limits.push(n); return { get: async () => { if (state.fail) throw Error('private error'); return { docs: state.rows.slice(0, n).map(row => ({ id: row.id, data: () => row })) }; } };
  } }) });
  return { getAdminDb: () => state.available ? { collection } : null };
});
import { getRecentLivDailySourceUrls, getRecentLivDailyTopics, getRecentLivDailySlugs } from '@/lib/liv/daily-history-store';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const pointer = (topic: string) => `livSourceArchives/${hash('liv-daily')}/topics/${hash(topic.toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu, ' ').trim())}`;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime('2026-09-27T10:00:00Z'); state.rows = []; state.docs.clear(); state.paths = []; state.limits = []; state.fail = false; state.available = true; });
afterEach(() => vi.useRealTimers());
it('uses exact canonical source URLs for checkpoint and archived pre-checkpoint failures', async () => {
  state.rows = [
    { id: 'failed', status: 'failed', topic: 'Artigeardit!', reason: 'source_similarity_unapproved', sourceUrl: 'https://www.example.org/story/?utm_source=feed',
      articleCheckpoint: { researchSources: [{ url: 'https://example.org/primary' }] } },
    { id: 'same-topic', status: 'failed', topic: 'Artigeardit', reason: 'source_similarity_unapproved' },
    { id: 'own', status: 'failed', topic: 'Egen historie', sourceUrl: 'https://example.org/own' },
  ];
  state.docs.set(pointer('Artigeardit'), { latestBrief: { sources: [{ url: 'https://example.org/secondary?utm_medium=feed' }] } });
  expect(await getRecentLivDailySourceUrls(14, 'own')).toEqual(new Set(['https://example.org/story', 'https://example.org/primary', 'https://example.org/secondary']));
  expect(state.paths).toEqual([pointer('Artigeardit')]);
});
it('allows cooled-down pre-writing failures but excludes paid source rejection', async () => {
  state.rows = [
    { id: 'transport', status: 'failed', topic: 'Transport', reason: 'liv_trending_http_503', completedAt: new Date(Date.now() - 7 * 3600000), sourceUrl: 'https://example.org/transport' },
    { id: 'paid', status: 'failed', topic: 'Paid', reason: 'source_similarity_unapproved', completedAt: new Date(Date.now() - 7 * 3600000), sourceUrl: 'https://example.org/paid' },
  ];
  expect(await getRecentLivDailySourceUrls()).toEqual(new Set(['https://example.org/paid']));
});
it('does not confuse a day argument with a unique-title cutoff within the bounded query', async () => {
  state.rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i), status: 'published', topic: `Topic ${i}`, slug: `slug-${i}`, sourceUrl: `https://example.org/story-${i}` }));
  expect((await getRecentLivDailySourceUrls()).size).toBe(20);
  expect((await getRecentLivDailyTopics()).size).toBe(20);
  expect((await getRecentLivDailySlugs()).size).toBe(20);
  expect(state.limits).toEqual([56, 56, 56]);
});
it('fails closed on unavailable history, without exposing upstream errors', async () => {
  state.fail = true; await expect(getRecentLivDailySourceUrls()).rejects.toThrow('liv_topic_history_unavailable');
  state.available = false; await expect(getRecentLivDailySourceUrls()).rejects.toThrow('liv_topic_history_unavailable');
});
