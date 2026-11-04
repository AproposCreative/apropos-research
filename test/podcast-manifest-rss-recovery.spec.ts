import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { PODCAST_ARTWORK_STYLE } from '../lib/podcast/artwork-style';

const state = vi.hoisted(() => ({ bytes: Buffer.alloc(0), exists: true, downloadError: false, writes: vi.fn() }));
vi.mock('@/lib/podcast/bucket', () => ({
  FEED_PATH: 'podcasts/feed.xml', MANIFEST_PATH: 'podcasts/manifest.json',
  publishedAudioPath: (slug: string) => `podcasts/articles/${slug}/audio.m4a`,
  resolvePodcastBucketName: () => 'fixture-bucket',
  getPodcastBucket: () => ({ file: () => ({
    exists: async () => [state.exists],
    download: async () => { if (state.downloadError) throw Error('Unavailable'); return [state.bytes]; },
    save: state.writes,
  }) }),
}));
vi.mock('@/lib/podcast/feed-metadata', () => ({
  readPodcastFeedMetadata: async (manifest: { episodes: Array<{ id: string; guid?: string; articleSlug: string; title: string }> }) =>
    Object.fromEntries(manifest.episodes.map(ep => [ep.guid || ep.id, {
      id: 'cms-fixture', slug: ep.articleSlug, title: ep.title, description: '', coverUrl: 'https://example.test/photo.jpg', credit: '',
      guid: ep.guid || ep.id, articleIdentity: ep.articleSlug, sourceHash: 'fixture', artworkStyle: PODCAST_ARTWORK_STYLE,
      imageURL: 'https://example.test/artwork.jpg', artworkSha256: 'a'.repeat(64), artworkBytes: 1000, updatedAt: '2026-10-31T12:00:00Z',
    }])),
}));
vi.mock('@/lib/podcast/delivery-facts', () => ({ readPodcastDeliveryFacts: async () => ({}) }));

import { normalizeManifestEpisode, buildManifestEpisode } from '../lib/podcast/manifest-format';
import { readPodcastManifest } from '../lib/podcast/manifest';
import { GET } from '../app/api/podcast/rss/route';

const revision = 'cms-sha256-v1:' + 'b'.repeat(64);
const episode = (patch: Record<string, unknown> = {}) => ({
  id: 'ai-existing-review', guid: 'ai-existing-review', articleSlug: 'existing-review', title: 'En eksisterende anmeldelse',
  subtitle: 'Lyt til artiklen', kind: 'ai', articleId: '6ae5df9e1a88dda9a0b30ba2',
  audioURL: 'https://example.test/original.m4a?token=synthetic-fixture', publishedAt: '2026-10-31T21:00:20.041Z',
  durationSeconds: 450, audioBytes: 11989519, hosts: ['Apropos Magazine'], ...patch,
});
const catalog = (episodes: unknown[]) => Buffer.from(JSON.stringify({ version: 1, updatedAt: '2026-11-02T21:03:42.968Z', episodes }));
const request = () => new NextRequest('https://example.test/api/podcast/rss');

beforeEach(() => { state.exists = true; state.downloadError = false; state.writes.mockReset(); state.bytes = catalog([episode()]); });

describe('existing accepted recordings through the web manifest reader', () => {
  it('reads the accepted canonical AI association and preserves the original recording metadata', () => {
    const raw = episode(), result = normalizeManifestEpisode(raw)!;
    expect(result.articleId).toBe(raw.articleId);
    expect(Object.hasOwn(result, 'sourceContentRevision')).toBe(false);
    for (const key of ['id', 'guid', 'audioURL', 'publishedAt', 'audioBytes', 'durationSeconds', 'kind'] as const) expect(result[key]).toEqual(raw[key]);
  });
  it('preserves a producer revision verbatim and keeps legacy unbound rows supported', () => {
    expect(normalizeManifestEpisode(episode({ sourceContentRevision: revision }))?.sourceContentRevision).toBe(revision);
    const legacy = episode(); delete (legacy as Partial<typeof legacy>).articleId;
    expect(normalizeManifestEpisode(legacy)?.id).toBe(legacy.id);
  });
  for (const invalid of [null, '', 0, undefined, 'wrong-revision']) it(`rejects a present malformed producer revision (${String(invalid)})`, () => {
    expect(() => normalizeManifestEpisode(episode({ sourceContentRevision: invalid }))).toThrow('Invalid podcast source binding');
  });
  for (const id of ['not-canonical', ' 6ae5df9e1a88dda9a0b30ba2', 'en_6ae5df9e1a88dda9a0b30ba2']) it(`rejects an incomplete noncanonical association (${id})`, () => {
    expect(() => normalizeManifestEpisode(episode({ articleId: id }))).toThrow('Invalid podcast source binding');
  });
  it('does not relax human recording receipts or allow revision without an article', () => {
    expect(() => normalizeManifestEpisode(episode({ kind: 'human' }))).toThrow();
    expect(() => normalizeManifestEpisode(episode({ articleId: undefined, sourceContentRevision: revision }))).toThrow();
    expect(() => normalizeManifestEpisode(episode({ audioObjectGeneration: '123', audioSHA256: 'a'.repeat(64) }))).toThrow('Invalid human audio receipt');
  });
  it('keeps new publication inputs strict instead of manufacturing accepted recordings', () => {
    expect(() => buildManifestEpisode({ slug: 'existing-review', title: 'Review', audioURL: 'https://example.test/new.m4a', kind: 'ai', articleId: '6ae5df9e1a88dda9a0b30ba2' })).toThrow('Invalid podcast source binding');
  });
  it('reads all 155 rows without dropping or redating unrelated episodes', async () => {
    const rows = Array.from({ length: 155 }, (_, i) => episode({ id: `ai-review-${i}`, guid: `ai-review-${i}`, articleSlug: `review-${i}`, ...(i === 0 || i === 6 ? {} : { sourceContentRevision: revision }) }));
    state.bytes = catalog(rows); const before = Buffer.from(state.bytes), result = await readPodcastManifest();
    expect(result.episodes).toHaveLength(155);
    expect(result.episodes.map(ep => [ep.id, ep.guid, ep.audioURL, ep.publishedAt])).toEqual(rows.map(ep => [ep.id, ep.guid, ep.audioURL, ep.publishedAt]));
    expect(state.bytes.equals(before)).toBe(true); expect(state.writes).not.toHaveBeenCalled();
  });
});

describe('RSS recovery and failures', () => {
  it('restores existing episodes with the same GUIDs, original dates, audio URLs and descending order', async () => {
    const old = episode({ id: 'ai-old-review', guid: 'ai-old-review', articleSlug: 'old-review', publishedAt: '2026-08-21T19:35:40.100Z', sourceContentRevision: revision });
    state.bytes = catalog([old, episode()]); const result = await GET(request()); expect(result.status).toBe(200);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(await result.text()).rss.channel.item;
    expect(parsed.map((item: any) => item.guid['#text'])).toEqual(['ai-existing-review', 'ai-old-review']);
    expect(parsed.map((item: any) => new Date(item.pubDate).getTime())).toEqual([episode(), old].map(ep => Math.floor(Date.parse(ep.publishedAt) / 1000) * 1000));
    expect(parsed[0].enclosure['@_url']).toBe(episode().audioURL);
    expect(state.writes).not.toHaveBeenCalled();
  });
  for (const bad of ['{', JSON.stringify({ episodes: 'bad' }), catalog([episode({ sourceContentRevision: null })]).toString(), catalog([episode({ audioURL: '' })]).toString()]) it('returns 503 rather than publishing a false empty feed for malformed catalog content', async () => {
    state.bytes = Buffer.from(bad); const result = await GET(request());
    expect(result.status).toBe(503); expect(result.headers.get('Cache-Control')).toBe('no-store'); expect(state.writes).not.toHaveBeenCalled();
  });
  for (const date of [undefined, null, '', 'not-a-date']) it(`does not replace an invalid existing publication date with today (${String(date)})`, async () => {
    state.bytes = catalog([episode({ publishedAt: date })]); expect((await GET(request())).status).toBe(503);
  });
  it('returns 503 for missing or unavailable storage and keeps a genuinely empty catalog readable', async () => {
    state.exists = false; expect((await GET(request())).status).toBe(503);
    state.exists = true; state.downloadError = true; expect((await GET(request())).status).toBe(503);
    state.downloadError = false; state.bytes = catalog([]); expect((await readPodcastManifest()).episodes).toEqual([]);
  });
});
