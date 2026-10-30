import { beforeEach, expect, it, vi } from 'vitest';
import { podcastAudioKey } from '../lib/podcast/delivery-format';
import { podcastMetadataKey } from '../lib/podcast/feed-metadata-format';
import type { PodcastManifest, PodcastManifestEpisode } from '../lib/podcast/types';
const state = vi.hoisted(() => ({ records: new Map<string, any>(), file: vi.fn(), download: vi.fn(), metadata: vi.fn(), spotify: vi.fn(), covers: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
  getAll: async (...refs: Array<{ path: string }>) => refs.map(ref => ({ data: () => state.records.get(ref.path) })),
  runTransaction: async (run: (tx: any) => Promise<void>) => run({ get: async (ref: { path: string }) => ({ data: () => state.records.get(ref.path) }),
    set: (ref: { path: string }, value: unknown) => state.records.set(ref.path, value) }),
}) }));
vi.mock('@/lib/podcast/bucket', () => ({ getPodcastBucket: () => ({ name: 'our-bucket', file: state.file }) }));
vi.mock('@/lib/podcast/feed-metadata', () => ({ readPodcastFeedMetadata: state.covers }));
vi.mock('@/lib/podcast/spotify-evidence', async original => ({ ...await original<typeof import('../lib/podcast/spotify-evidence')>(), readSpotifyPublicEpisode: state.spotify }));
import { syncPodcastDurations, readPodcastDeliveryFacts, measureExistingEpisodeDuration, verifySpotifyDelivery } from '../lib/podcast/delivery-facts';
function atom(type: string, payload: Buffer) { const header = Buffer.alloc(8); header.writeUInt32BE(payload.length + 8); header.write(type, 4); return Buffer.concat([header, payload]); }
const movieHeader = Buffer.alloc(20); movieHeader.writeUInt32BE(1000, 12); movieHeader.writeUInt32BE(426000, 16);
const audio = Buffer.concat([atom('ftyp', Buffer.alloc(16)), atom('moov', atom('mvhd', movieHeader)), atom('mdat', Buffer.alloc(12))]);
const ep: PodcastManifestEpisode = { guid: 'a', id: 'a', articleSlug: 'anmeldelse', title: 'En anmeldelse', subtitle: 'Lyt til artiklen',
  audioURL: 'https://firebasestorage.googleapis.com/v0/b/our-bucket/o/podcasts%2Fnarration%2Fanmeldelse%2Fanmeldelse.m4a?alt=media&token=public',
  audioBytes: audio.length, hosts: ['Frederik'], publishedAt: '2026-10-28T15:28:40Z' };
const manifest: PodcastManifest = { version: 1, updatedAt: ep.publishedAt, episodes: [ep] };
beforeEach(() => {
  state.records.clear(); vi.clearAllMocks();
  state.file.mockReturnValue({ getMetadata: state.metadata, download: state.download, save: state.save });
  state.metadata.mockResolvedValue([{ generation: '7', size: String(audio.length) }]);
  state.download.mockImplementation(async ({ start, end }: { start: number; end: number }) => [audio.subarray(start, end + 1)]);
  state.covers.mockResolvedValue({}); state.spotify.mockResolvedValue(null);
});
it('fills duration from small pinned byte ranges without writing audio or changing the original manifest', async () => {
  const before = JSON.stringify(manifest);
  expect((await syncPodcastDurations(manifest)).updated).toEqual(['a']);
  const fact = (await readPodcastDeliveryFacts(manifest)).a;
  expect(fact).toMatchObject({ durationSeconds: 426, durationSource: 'mp4-mvhd', audioGeneration: '7', audioKey: podcastAudioKey(ep) });
  expect(state.file.mock.calls.some(call => call[1]?.generation === '7')).toBe(true);
  expect(state.download.mock.calls.every(([range]) => range.end - range.start < 1024 * 1024)).toBe(true);
  expect(state.save).not.toHaveBeenCalled(); expect(JSON.stringify(manifest)).toBe(before);
  expect((await syncPodcastDurations(manifest)).updated).toEqual([]);
  expect(state.metadata).toHaveBeenCalledTimes(1);
});
it('keeps failed measurement resumable and clears it only after successful readback', async () => {
  state.metadata.mockRejectedValueOnce(Error('private provider credential details'));
  expect((await syncPodcastDurations(manifest)).failed).toEqual([{ guid: 'a', reason: 'duration_unavailable' }]);
  expect((await readPodcastDeliveryFacts(manifest)).a.durationFailure).toBe('duration_unavailable');
  expect((await syncPodcastDurations(manifest)).updated).toEqual(['a']);
  expect((await readPodcastDeliveryFacts(manifest)).a.durationFailure).toBeNull();
  expect(state.save).not.toHaveBeenCalled();
});
it('rejects foreign hosts, foreign buckets and changed file sizes before recording a fact', async () => {
  await expect(measureExistingEpisodeDuration({ ...ep, audioURL: 'https://private.example/file.m4a' })).rejects.toThrow('source_invalid');
  await expect(measureExistingEpisodeDuration({ ...ep, audioURL: ep.audioURL.replace('our-bucket', 'another-bucket') })).rejects.toThrow('source_invalid');
  expect(state.file).not.toHaveBeenCalled();
  state.metadata.mockResolvedValue([{ generation: '8', size: String(audio.length + 1) }]);
  await expect(measureExistingEpisodeDuration(ep)).rejects.toThrow('identity_changed'); expect(state.download).not.toHaveBeenCalled();
});
it('ignores a cached fact when the same episode receives a different audio asset', async () => {
  await syncPodcastDurations(manifest);
  expect(await readPodcastDeliveryFacts({ ...manifest, episodes: [{ ...ep, audioURL: ep.audioURL + '-new' }] })).toEqual({});
});
it('records a real Spotify URL only after parent, title, date and measured duration match', async () => {
  await syncPodcastDurations(manifest);
  state.spotify.mockResolvedValue({ id: '0UxG5lNMhor1j0ElNdjrER', title: ep.title, releasedAt: '2026-10-28T15:28:00Z', durationSeconds: 426, showId: '2I1kdhSpGpADdK26NoDOE8' });
  expect(await verifySpotifyDelivery(manifest)).toMatchObject({ verified: true, guid: 'a' });
  expect((await readPodcastDeliveryFacts(manifest)).a.spotify).toMatchObject({ url: 'https://open.spotify.com/episode/0UxG5lNMhor1j0ElNdjrER', source: 'spotify-public-embed' });
  state.spotify.mockResolvedValue(null);
  expect(await verifySpotifyDelivery(manifest)).toEqual({ verified: false, reason: 'spotify_unavailable' });
  expect((await readPodcastDeliveryFacts(manifest)).a.spotify).toBeDefined();
});
it('does not create Spotify proof from a guessed title or overwrite another audio revision', async () => {
  state.spotify.mockResolvedValue({ id: '0UxG5lNMhor1j0ElNdjrER', title: ep.title, releasedAt: '2026-10-28T15:28:00Z', durationSeconds: 426, showId: '2I1kdhSpGpADdK26NoDOE8' });
  expect(await verifySpotifyDelivery(manifest)).toMatchObject({ verified: false });
  expect(state.records.has(`podcastDeliveryFacts/${podcastMetadataKey('a')}`)).toBe(false);
});
