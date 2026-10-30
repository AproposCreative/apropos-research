import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { XMLParser } from 'fast-xml-parser';
import { applyPodcastFeedMetadata, matchPodcastArticle, podcastSourceHash, publishedPodcastArticle,
  type PodcastFeedMetadata } from '../lib/podcast/feed-metadata-format';
import { buildPodcastRssXml } from '../lib/podcast/rss';
import type { PodcastManifest, PodcastManifestEpisode } from '../lib/podcast/types';

const mocks = vi.hoisted(() => ({ store: vi.fn(), fetch: vi.fn(), records: new Map<string, any>() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
  getAll: async (...refs: Array<{ path: string }>) => refs.map(r => ({ data: () => mocks.records.get(r.path) })),
  runTransaction: async (run: (tx: any) => Promise<unknown>) => run({
    get: async (ref: { path: string }) => ({ data: () => mocks.records.get(ref.path) }),
    set: (ref: { path: string }, data: unknown) => { mocks.records.set(ref.path, data); },
    delete: (ref: { path: string }) => { mocks.records.delete(ref.path); },
  }),
}) }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ apiToken: 'test-private-token', articlesCollectionId: 'articles' }) }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/podcast/feed-artwork', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/podcast/feed-artwork')>(), storePodcastArtwork: mocks.store,
}));
import { encodePodcastArtwork, PODCAST_ARTWORK_MAX_BYTES } from '../lib/podcast/feed-artwork';
import { fetchPublishedPodcastArticles, readPodcastFeedMetadata, syncPodcastFeedMetadata } from '../lib/podcast/feed-metadata';

const episode: PodcastManifestEpisode = { id: 'original-id', guid: 'original-guid', articleSlug: 'deep-purple---royal-arena',
  title: 'Gammel anmeldelse', description: 'Den gamle beskrivelse.', subtitle: 'Lyt til artiklen', hosts: ['Peter Milo'],
  audioURL: 'https://example.test/audio.m4a', audioBytes: 1234, durationSeconds: 123, publishedAt: '2026-10-01T10:00:00Z' };
const manifest: PodcastManifest = { version: 1, updatedAt: '2026-10-01T10:00:00Z', episodes: [episode] };
const liveItem = { id: 'cms-id', fieldData: { slug: 'deep-purple---royal-arena', name: 'Anmeldelse: Deep Purple - Royal Arena',
  intro: '<p>Rocken <em>lever</em> stadig &amp; orglet gløder.</p>', thumb: { url: 'https://cdn.example.test/approved.webp' }, 'foto-credit': 'Foto: Fotografen' } };
const article = publishedPodcastArticle(liveItem)!;
const metadata: PodcastFeedMetadata = { ...article, guid: episode.guid!, articleIdentity: 'deep-purple-royal-arena',
  sourceHash: podcastSourceHash(article), imageURL: 'https://example.test/square.jpg', artworkSha256: 'sha', artworkBytes: 12345, updatedAt: '2026-10-30T10:00:00Z' };

beforeEach(() => {
  mocks.records.clear(); mocks.store.mockReset(); mocks.fetch.mockReset(); vi.stubGlobal('fetch', mocks.fetch);
  mocks.store.mockResolvedValue({ imageURL: metadata.imageURL, artworkSha256: 'sha', artworkBytes: 12345 });
  mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ items: [liveItem] }), { status: 200 }));
});

describe('published episode presentation', () => {
  it('uses the actual published thumb field, approved title and plain short copy', () => {
    expect(article.title).toBe('Anmeldelse: Deep Purple - Royal Arena');
    expect(article.coverUrl).toBe('https://cdn.example.test/approved.webp');
    expect(article.description).toBe('Rocken lever stadig & orglet gløder.');
    expect(publishedPodcastArticle({ ...liveItem, isDraft: true })).toBeNull();
    expect(publishedPodcastArticle({ ...liveItem, isArchived: true })).toBeNull();
  });
  it('prefers short published meta description, strips scripts and bounds long text', () => {
    const result = publishedPodcastArticle({ ...liveItem, fieldData: { ...liveItem.fieldData,
      'meta-description': '<script>secret()</script><p>' + 'Kultur og musik. '.repeat(100) + '</p>' } });
    expect(result!.description.length).toBeLessThanOrEqual(600);
    expect(result!.description).not.toContain('secret');
    expect(result!.description).toMatch(/^Kultur og musik/);
  });
  it('matches exact slugs or one unique normalized identity, never an ambiguous guess', () => {
    expect(matchPodcastArticle('deep-purple-royal-arena', [article])).toEqual(article);
    expect(matchPodcastArticle('deep-purple-royal-arena', [article, { ...article, slug: 'deep-purple--royal-arena' }])).toBeNull();
    expect(matchPodcastArticle('another-review', [article])).toBeNull();
  });
  it('recovers legacy translated slugs only through a unique exact full title', () => {
    expect(matchPodcastArticle('old-english-slug', [article], article.title)).toEqual(article);
    expect(matchPodcastArticle('old-english-slug', [article], 'Deep Purple')).toBeNull();
    expect(matchPodcastArticle('old-english-slug', [article, { ...article, id: 'another-cms-id' }], article.title)).toBeNull();
  });
  it('keeps an established CMS identity after a title or slug changes and never rebinds a missing item', () => {
    const renamed = { ...article, title: 'Ny titel', slug: 'ny-slug' };
    expect(matchPodcastArticle('old-slug', [renamed], 'Old title', article.id)).toEqual(renamed);
    expect(matchPodcastArticle(article.slug, [article], article.title, 'deleted-id')).toBeNull();
  });
  it('changes only presentation and keeps immutable identity, audio and dates', () => {
    const changed = applyPodcastFeedMetadata(episode, metadata);
    expect(changed.title).toBe(article.title);
    for (const key of ['id', 'guid', 'audioURL', 'audioBytes', 'durationSeconds', 'articleSlug', 'publishedAt', 'hosts', 'kind'] as const)
      expect(changed[key]).toEqual(episode[key]);
    expect(episode.title).toBe('Gammel anmeldelse');
    expect(applyPodcastFeedMetadata(episode, { ...metadata, guid: 'someone-else' })).toBe(episode);
    expect(applyPodcastFeedMetadata(episode, { ...metadata, articleIdentity: 'different-book' })).toBe(episode);
  });
  it('applies presentation after language/duplicate selection and preserves RSS identity', () => {
    const xml = buildPodcastRssXml({ manifest, feedUrl: 'https://example.test/rss', metadata: { [episode.guid!]: { ...metadata, title: 'The music review', description: 'The concert was great.' } } });
    const item = new XMLParser({ ignoreAttributes: false }).parse(xml).rss.channel.item;
    expect(item.title).toBe('The music review');
    expect(item.guid['#text']).toBe(episode.guid);
    expect(item.enclosure['@_url']).toBe(episode.audioURL);
    expect(item.enclosure['@_length']).toBe('1234');
    expect(item['itunes:image']['@_href']).toBe(metadata.imageURL);
    expect(new Date(item.pubDate).toISOString()).toBe(episode.publishedAt.replace('Z', '.000Z'));
  });
});

describe('safe podcast artwork', () => {
  it('keeps the whole landscape image in a square RGB JPEG without cropping', async () => {
    const original = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const bytes = await encodePodcastArtwork(original), decoded = sharp(bytes);
    const info = await decoded.metadata();
    expect(info).toMatchObject({ format: 'jpeg', width: 1400, height: 1400, space: 'srgb', channels: 3 });
    expect(bytes.length).toBeLessThanOrEqual(PODCAST_ARTWORK_MAX_BYTES);
    const { data } = await decoded.raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * 1400 + x) * 3, (y * 1400 + x) * 3 + 3)];
    expect(pixel(700, 20)[0]).toBeLessThan(30); // letterbox, no crop
    expect(pixel(10, 700)[0]).toBeGreaterThan(240); // both image edges retained
    expect(pixel(1390, 700)[0]).toBeGreaterThan(240);
  });
  it('rejects non-images without uploading anything', async () => {
    await expect(encodePodcastArtwork(Buffer.from('<html>error</html>'))).rejects.toThrow();
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it('handles the observed 60MP legacy LP photo within the shared 80MP image ceiling', async () => {
    const original = await sharp({ create: { width: 9504, height: 6336, channels: 3, background: '#eeeeee' } }).webp().toBuffer();
    const output = await encodePodcastArtwork(original);
    expect(await sharp(output).metadata()).toMatchObject({ format: 'jpeg', width: 1400, height: 1400 });
    expect(output.length).toBeLessThanOrEqual(PODCAST_ARTWORK_MAX_BYTES);
  });
});

describe('metadata synchronization', () => {
  it('fetches only live CMS pages, follows all pages, and never mixes in partial inventory on failure', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ items: Array.from({ length: 100 }, (_, i) => ({ ...liveItem, id: String(i) })) })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [liveItem] })));
    expect(await fetchPublishedPodcastArticles()).toHaveLength(101);
    expect(mocks.fetch.mock.calls[0][0]).toContain('/items/live?limit=100&offset=0');
    expect(mocks.fetch.mock.calls[1][0]).toContain('offset=100');
    mocks.fetch.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(fetchPublishedPodcastArticles()).rejects.toThrow('podcast_live_cms_http_503');
  });
  it('is idempotent and reuses verified art when only the title changes', async () => {
    const before = JSON.stringify(manifest);
    expect((await syncPodcastFeedMetadata(manifest)).updated).toEqual([episode.guid]);
    expect((await syncPodcastFeedMetadata(manifest)).updated).toEqual([]);
    expect(mocks.store).toHaveBeenCalledTimes(1);
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ items: [{ ...liveItem, fieldData: { ...liveItem.fieldData, name: 'Den rettede anmeldelse' } }] })));
    expect((await syncPodcastFeedMetadata(manifest)).updated).toEqual([episode.guid]);
    expect(mocks.store).toHaveBeenCalledTimes(1);
    expect((await readPodcastFeedMetadata(manifest))[episode.guid!].title).toBe('Den rettede anmeldelse');
    expect(JSON.stringify(manifest)).toBe(before);
  });
  it('keeps last good metadata on cover failure and safely resumes the same operation', async () => {
    await syncPodcastFeedMetadata(manifest);
    const before = await readPodcastFeedMetadata(manifest);
    mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ items: [{ ...liveItem, fieldData: { ...liveItem.fieldData, thumb: { url: 'https://cdn.example.test/new.webp' } } }] })));
    mocks.store.mockRejectedValueOnce(Error('private token and connection stack'));
    expect((await syncPodcastFeedMetadata(manifest)).failed).toEqual([{ guid: episode.guid, reason: 'podcast_artwork_processing_failed' }]);
    expect(await readPodcastFeedMetadata(manifest)).toEqual(before);
    expect((await syncPodcastFeedMetadata(manifest)).updated).toEqual([episode.guid]);
    expect((await syncPodcastFeedMetadata(manifest)).updated).toEqual([]);
  });
  it('does not create art for missing/ambiguous articles or a missing published cover', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })));
    expect((await syncPodcastFeedMetadata(manifest)).unmatched).toEqual([episode.guid]);
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...liveItem, fieldData: { ...liveItem.fieldData, thumb: null } }] })));
    expect((await syncPodcastFeedMetadata(manifest)).failed).toEqual([{ guid: episode.guid, reason: 'podcast_published_cover_missing' }]);
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it('respects a running lease; an interrupted operation can resume after its lease expires', async () => {
    mocks.records.set('podcastFeedOperations/metadata-sync', { lease: 'another-worker', leaseUntil: Date.now() + 240000 });
    expect((await syncPodcastFeedMetadata(manifest)).busy).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.records.set('podcastFeedOperations/metadata-sync', { lease: 'expired-worker', leaseUntil: Date.now() - 1 });
    expect((await syncPodcastFeedMetadata(manifest)).updated).toEqual([episode.guid]);
    expect(mocks.records.has('podcastFeedOperations/metadata-sync')).toBe(false);
  });
});
