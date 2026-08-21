import { PODCAST_SHOW, podcastShowCoverUrl } from '@/lib/podcast/show-config';
import type { PodcastManifest, PodcastManifestEpisode } from '@/lib/podcast/types';
import { formatItunesDuration } from '@/lib/podcast/probe-duration';
import { articleUrlFromSlug } from '@/lib/podcast/manifest-format';
import { isEnglishPodcastEpisode } from '@/lib/podcast/episode-locale';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function toRfc822(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function enclosureType(audioURL: string): string {
  const lower = audioURL.toLowerCase();
  if (lower.includes('.mp3')) return 'audio/mpeg';
  if (lower.includes('.wav')) return 'audio/wav';
  return 'audio/mp4';
}

function episodeDescription(ep: PodcastManifestEpisode): string {
  const raw = (ep.description || '').trim();
  if (raw) return raw;
  return `${ep.title}. ${ep.subtitle || 'Lyt til artiklen'} — Apropos Magazine.`;
}

function buildItemXml(ep: PodcastManifestEpisode, showCover: string): string {
  const link = ep.articleUrl || articleUrlFromSlug(ep.articleSlug);
  const guid = ep.guid || ep.id || ep.articleSlug;
  const image = ep.imageURL || showCover;
  const author = (ep.hosts || []).filter(Boolean).join(', ') || PODCAST_SHOW.author;
  const length = typeof ep.audioBytes === 'number' && ep.audioBytes > 0 ? String(ep.audioBytes) : '0';
  const duration =
    typeof ep.durationSeconds === 'number' && ep.durationSeconds > 0
      ? formatItunesDuration(ep.durationSeconds)
      : null;

  const lines = [
    '    <item>',
    `      <title>${escapeXml(ep.title)}</title>`,
    `      <description>${cdata(episodeDescription(ep))}</description>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(guid)}</guid>`,
    `      <pubDate>${toRfc822(ep.publishedAt)}</pubDate>`,
    `      <enclosure url="${escapeXml(ep.audioURL)}" length="${length}" type="${enclosureType(ep.audioURL)}" />`,
    `      <itunes:author>${escapeXml(author)}</itunes:author>`,
    `      <itunes:summary>${cdata(episodeDescription(ep))}</itunes:summary>`,
    `      <itunes:explicit>${PODCAST_SHOW.explicit ? 'true' : 'false'}</itunes:explicit>`,
    `      <itunes:image href="${escapeXml(image)}" />`,
    `      <itunes:episodeType>full</itunes:episodeType>`,
  ];
  if (duration) {
    lines.push(`      <itunes:duration>${duration}</itunes:duration>`);
  }
  lines.push('    </item>');
  return lines.join('\n');
}

export function buildPodcastRssXml(input: {
  manifest: PodcastManifest;
  feedUrl: string;
  showCoverUrl?: string;
}): string {
  const showCover = input.showCoverUrl || podcastShowCoverUrl();
  const lastBuild = input.manifest.updatedAt || new Date().toISOString();
  const episodes = input.manifest.episodes.filter(
    (ep) =>
      !isEnglishPodcastEpisode({
        articleSlug: ep.articleSlug,
        title: ep.title,
        description: ep.description,
      })
  );
  const items = episodes.map((ep) => buildItemXml(ep, showCover)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(PODCAST_SHOW.title)}</title>
    <link>${escapeXml(PODCAST_SHOW.link)}</link>
    <description>${cdata(PODCAST_SHOW.description)}</description>
    <language>${PODCAST_SHOW.language}</language>
    <copyright>${escapeXml(`© ${new Date().getFullYear()} Apropos Magazine`)}</copyright>
    <lastBuildDate>${toRfc822(lastBuild)}</lastBuildDate>
    <atom:link href="${escapeXml(input.feedUrl)}" rel="self" type="application/rss+xml" />
    <itunes:author>${escapeXml(PODCAST_SHOW.author)}</itunes:author>
    <itunes:summary>${cdata(PODCAST_SHOW.description)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:owner>
      <itunes:name>${escapeXml(PODCAST_SHOW.ownerName)}</itunes:name>
      <itunes:email>${escapeXml(PODCAST_SHOW.ownerEmail)}</itunes:email>
    </itunes:owner>
    <itunes:explicit>${PODCAST_SHOW.explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:category text="${escapeXml(PODCAST_SHOW.category)}" />
    <itunes:image href="${escapeXml(showCover)}" />
    <image>
      <url>${escapeXml(showCover)}</url>
      <title>${escapeXml(PODCAST_SHOW.title)}</title>
      <link>${escapeXml(PODCAST_SHOW.link)}</link>
    </image>
${items}
  </channel>
</rss>
`;
}
