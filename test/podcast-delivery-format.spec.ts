import { describe, expect, it } from 'vitest';
import { isEnglishPodcastEpisode } from '../lib/podcast/episode-locale';
import { normalizeManifestEpisode } from '../lib/podcast/manifest-format';
import { podcastAudioKey, applyPodcastDeliveryFact, nextPodcastIssue } from '../lib/podcast/delivery-format';
import { durationFromMovieAtom, readMp4Duration } from '../lib/podcast/mp4-duration';
import { parseSpotifyPublicEpisode, matchSpotifyEpisode } from '../lib/podcast/spotify-evidence';
import { PODCAST_SPOTIFY_SHOW_ID } from '../lib/podcast/delivery-labels';
import type { PodcastManifestEpisode } from '../lib/podcast/types';

export function box(type: string, content: Buffer) { const head = Buffer.alloc(8); head.writeUInt32BE(8 + content.length); head.write(type, 4, 'ascii'); return Buffer.concat([head, content]); }
export function movie(seconds = 426, version = 0) { const b = Buffer.alloc(version === 1 ? 32 : 20); b[0] = version;
  b.writeUInt32BE(1000, version === 1 ? 20 : 12); if (version) b.writeBigUInt64BE(BigInt(seconds * 1000), 24); else b.writeUInt32BE(seconds * 1000, 16);
  return box('moov', box('mvhd', b)); }
export const deliveryEpisode: PodcastManifestEpisode = { id: 'original', guid: 'original', articleSlug: 'boganmeldelse', title: 'En dansk boganmeldelse', subtitle: 'Lyt til artiklen', audioURL: 'https://example.test/original.m4a', hosts: ['Liv'], publishedAt: '2026-10-28T15:28:40Z' };

describe('Danish publication eligibility', () => {
  it.each([
    ['jeg-gik-paa-barsel-og-endte-i-en-religioes-uldsekt', 'Jeg gik på barsel og endte i en religiøs uldsekt'],
    ['saveus-pa-wonderfestiwall-2026-regnen-fik-ikke-en-chance', 'SAVEUS på Wonderfestiwall 2026: Regnen fik ikke en chance'],
    ['silo-en-dystopisk-faengselssymfoni-du-ikke-kan-slippe', 'Silo Sæson 1'],
    ['torsdag-syd-for-solen-2026', 'Torsdag på Syd for Solen 2026'],
    ['tak-for-turen-nak-aed', 'Nak & Æd'],
  ])('includes the observed Danish address %s', (articleSlug, title) => expect(isEnglishPodcastEpisode({ articleSlug, title })).toBe(false));
  it('keeps explicit English translations out and respects supplied language metadata', () => {
    expect(isEnglishPodcastEpisode({ articleSlug: 'review-en', title: 'Anmeldelse' })).toBe(true);
    expect(isEnglishPodcastEpisode({ articleSlug: 'en/review', title: 'A review' })).toBe(true);
    expect(isEnglishPodcastEpisode({ articleSlug: 'the-review', title: 'The concert review' })).toBe(true);
    expect(isEnglishPodcastEpisode({ articleSlug: 'review-en', title: 'Anmeldelse', language: 'da-DK' })).toBe(false);
    expect(isEnglishPodcastEpisode({ title: 'En boganmeldelse', language: 'en-GB' })).toBe(true);
    expect(normalizeManifestEpisode({ ...deliveryEpisode, locale: 'da-DK' })!.language).toBe('da-dk');
  });
});
describe('read-only duration measurement', () => {
  it.each([0, 1])('reads movie header version %s without decoding audio', async version => {
    const moov = movie(426, version); expect(durationFromMovieAtom(moov)).toBe(426);
    const whole = Buffer.concat([box('ftyp', Buffer.alloc(16)), moov, box('mdat', Buffer.alloc(16))]);
    expect(await readMp4Duration(whole.length, async (start, end) => whole.subarray(start, end + 1))).toBe(426);
  });
  it('skips a large audio payload and reads only headers when the movie atom is at the end', async () => {
    const offset = 50_000_000, mdat = Buffer.alloc(16); mdat.writeUInt32BE(offset); mdat.write('mdat', 4);
    const moov = movie(165), requests: Array<[number, number]> = [];
    const result = await readMp4Duration(offset + moov.length, async (start, end) => {
      requests.push([start, end]); return start === 0 ? mdat : moov.subarray(start - offset, end - offset + 1);
    });
    expect(result).toBe(165); expect(requests.reduce((sum, [a, b]) => sum + b - a + 1, 0)).toBeLessThan(200);
    expect(requests.some(([start]) => start === offset)).toBe(true);
  });
  it('rejects corrupt, zero-scale and oversized headers instead of inventing duration', async () => {
    expect(durationFromMovieAtom(Buffer.from('not an mp4'))).toBeNull();
    const zero = movie(); zero.writeUInt32BE(0, 28); expect(durationFromMovieAtom(zero)).toBeNull();
    const huge = Buffer.alloc(16); huge.writeUInt32BE(2 * 1024 * 1024); huge.write('moov', 4);
    expect(await readMp4Duration(3 * 1024 * 1024, async () => huge)).toBeNull();
  });
  it('applies measured facts only to the exact original audio identity', () => {
    const fact = { guid: 'original', audioKey: podcastAudioKey(deliveryEpisode), durationSeconds: 426 };
    expect(applyPodcastDeliveryFact(deliveryEpisode, fact).durationSeconds).toBe(426);
    expect(applyPodcastDeliveryFact({ ...deliveryEpisode, audioURL: 'https://example.test/new.m4a' }, fact).durationSeconds).toBeUndefined();
    expect(deliveryEpisode.durationSeconds).toBeUndefined();
    expect(applyPodcastDeliveryFact({ ...deliveryEpisode, durationSeconds: 123 }, fact).durationSeconds).toBe(123);
  });
});
describe('quiet issue lifecycle', () => {
  const input = { scope: 'original', stage: 'metadata', reason: 'cover_failed' };
  it('does not notify about the initial baseline or repeat an unchanged acknowledged incident', () => {
    const baseline = nextPodcastIssue(undefined, input, '2026-10-30T12:00:00Z', true);
    expect(baseline.acknowledgedFingerprint).toBe(baseline.fingerprint);
    const repeated = nextPodcastIssue(baseline, input, '2026-10-30T13:00:00Z', false);
    expect(repeated.firstSeenAt).toBe(baseline.firstSeenAt); expect(repeated.acknowledgedFingerprint).toBe(baseline.fingerprint);
  });
  it('marks a changed failure or a real recurrence as new', () => {
    const before = nextPodcastIssue(undefined, input, '2026-10-30T12:00:00Z', true);
    expect(nextPodcastIssue(before, { ...input, reason: 'other_error' }, '2026-10-30T13:00:00Z', false).acknowledgedFingerprint).toBeNull();
    expect(nextPodcastIssue({ ...before, active: false }, input, '2026-10-30T13:00:00Z', false).acknowledgedFingerprint).toBeNull();
  });
});
describe('verified Spotify references', () => {
  const publicEpisode = { id: '0UxG5lNMhor1j0ElNdjrER', title: deliveryEpisode.title, releasedAt: '2026-10-28T15:28:00Z', durationSeconds: 426, showId: PODCAST_SPOTIFY_SHOW_ID };
  it('matches the real parent show, exact title, original release time and measured duration', () => {
    const ep = { ...deliveryEpisode, durationSeconds: 426 };
    expect(matchSpotifyEpisode(publicEpisode, [ep])).toEqual(ep);
    expect(matchSpotifyEpisode({ ...publicEpisode, showId: 'another-show' }, [ep])).toBeNull();
    expect(matchSpotifyEpisode({ ...publicEpisode, durationSeconds: 800 }, [ep])).toBeNull();
    expect(matchSpotifyEpisode({ ...publicEpisode, releasedAt: '2025-01-01' }, [ep])).toBeNull();
    expect(matchSpotifyEpisode(publicEpisode, [ep, { ...ep, guid: 'another-id' }])).toBeNull();
    expect(matchSpotifyEpisode(publicEpisode, [deliveryEpisode])).toBeNull();
  });
  it('parses only descriptive public data, ignoring tokens and playback URLs', () => {
    const data = { props: { pageProps: { state: { data: { entity: { type: 'episode', id: publicEpisode.id, title: publicEpisode.title,
      duration: 426109, releaseDate: { isoString: publicEpisode.releasedAt }, relatedEntityUri: `spotify:show:${PODCAST_SPOTIFY_SHOW_ID}` }, accessToken: 'never-use-this', defaultAudioFileObject: { url: 'private-playback-url' } } } } } };
    const parsed = parseSpotifyPublicEpisode(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`);
    expect(parsed).toEqual(publicEpisode); expect(JSON.stringify(parsed)).not.toMatch(/never-use|private-playback/);
    expect(parseSpotifyPublicEpisode('<html>sign in</html>')).toBeNull();
  });
});
