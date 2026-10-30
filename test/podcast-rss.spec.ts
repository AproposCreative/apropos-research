import { describe, expect, it } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { buildPodcastRssXml } from '../lib/podcast/rss';
import { selectPodcastRssEpisodes } from '../lib/podcast/rss-episodes';
import type { PodcastManifestEpisode } from '../lib/podcast/types';

function episode(patch: Partial<PodcastManifestEpisode> = {}): PodcastManifestEpisode {
  return { id: 'ai-placebo-sluk-telefonen', guid: 'ai-placebo-sluk-telefonen', articleSlug: 'placebo-sluk-telefonen', title: 'Anmeldelse: Placebo i København', subtitle: 'Lyt til artiklen', hosts: ['Peter Milo'], audioURL: 'https://example.test/latest.m4a', publishedAt: '2026-10-27T10:25:13Z', kind: 'ai', audioBytes: 123456, durationSeconds: 348, ...patch };
}
const feed = (episodes: PodcastManifestEpisode[]) => buildPodcastRssXml({ manifest: { version: 1, updatedAt: '2026-10-30T13:00:00Z', episodes }, feedUrl: 'https://example.test/api/podcast/rss', showCoverUrl: 'https://example.test/cover.jpg' });
function items(xml: string) { const item = new XMLParser({ ignoreAttributes: false }).parse(xml).rss.channel.item; return Array.isArray(item) ? item : item ? [item] : []; }

describe('Spotify podcast feed', () => {
  it('publishes one latest revision for the observed legacy Placebo GUID collision', () => {
    const older = episode({ articleSlug: 'placebo---sluk-telefonen', title: 'Placebo før rettelsen', audioURL: 'https://example.test/older.m4a', publishedAt: '2026-10-26T14:37:10Z' });
    for (const source of [[older, episode()], [episode(), older]]) {
      const selected = selectPodcastRssEpisodes(source);
      expect(selected).toHaveLength(1);
      expect(selected[0].audioURL).toBe('https://example.test/latest.m4a');
      expect(selected[0].guid).toBe('ai-placebo-sluk-telefonen');
      expect(source).toHaveLength(2);
      expect(older.audioURL).toBe('https://example.test/older.m4a');
    }
  });
  it('retains a manual recording over an AI revision of the same identity', () => {
    const human = episode({ kind: 'human', audioURL: 'https://example.test/human.m4a', publishedAt: '2026-10-25T10:00:00Z' });
    expect(selectPodcastRssEpisodes([episode(), human])[0]).toBe(human);
  });
  it('does not silently merge different articles that happen to share a GUID', () => {
    expect(() => feed([episode(), episode({ articleSlug: 'helt-anden-bog' })])).toThrow('forskellige artikler');
  });
  it('preserves all distinct episodes beyond the public player pagination limit', () => {
    const source = Array.from({ length: 154 }, (_, i) => episode({ id: 'anmeldelse-'+i, guid: 'anmeldelse-'+i, articleSlug: 'anmeldelse-'+i }));
    expect(items(feed(source))).toHaveLength(154);
  });
  it('keeps the existing Danish feed language filter', () => {
    const english = episode({ id: 'english', guid: 'english', articleSlug: 'the-concert-review-en', title: 'The concert review', description: 'The concert was available for the community.' });
    expect(selectPodcastRssEpisodes([episode(), english])).toEqual([episode()]);
  });
  it('keeps GUIDs stable when titles, audio URLs and descriptions are revised', () => {
    const a = items(feed([episode()]))[0];
    const b = items(feed([episode({ title: 'Ny godkendt titel', audioURL: 'https://example.test/revised.m4a', description: 'Rettet beskrivelse.' })]))[0];
    expect(b.guid).toEqual(a.guid);
  });
  it('emits valid XML, AAC enclosures, actual bytes, duration and the original publication date', () => {
    const xml = feed([episode({ title: 'Musik & bøger <anmeldelse>', description: 'Et citat: ]]> og mere.' })]);
    expect(XMLValidator.validate(xml)).toBe(true);
    const item = items(xml)[0];
    expect(item.title).toBe('Musik & bøger <anmeldelse>');
    expect(item.enclosure['@_type']).toBe('audio/mp4');
    expect(item.enclosure['@_length']).toBe('123456');
    expect(item['itunes:duration']).toBe('5:48');
    expect(new Date(item.pubDate).toISOString()).toBe('2026-10-27T10:25:13.000Z');
  });
  it('keeps optional unknown duration absent rather than inventing one', () => {
    expect(items(feed([episode({ durationSeconds: undefined })]))[0]['itunes:duration']).toBeUndefined();
  });
});
