/** Show-level metadata for Spotify / Apple Podcasts RSS. */

export const PODCAST_SHOW = {
  title: 'Lyt til Apropos Magazine',
  description:
    'Lyt til Apropos Magazines artikler — kultur, film, musik og mere. Hver episode er en artikel fra aproposmagazine.com, oplæst med AI, så du kan følge med på øret, når du ikke har tid til at læse.',
  language: 'da-dk',
  link: 'https://www.aproposmagazine.com',
  ownerName: 'Liv',
  ownerEmail: 'liv@aproposmagazine.com',
  author: 'Apropos Magazine',
  category: 'Arts',
  explicit: false,
  /** Public path under this Next app (also mirrored to Firebase Storage). */
  coverPath: '/podcast/show-cover.jpg',
  /** Firebase Storage object path for show artwork. */
  coverStoragePath: 'podcasts/artwork/show-cover.jpg',
} as const;

export function podcastShowCoverUrl(origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_APP_URL || 'https://ai.aproposmagazine.com').replace(
    /\/$/,
    ''
  );
  return `${base}${PODCAST_SHOW.coverPath}`;
}

export function podcastRssFeedUrl(origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_APP_URL || 'https://ai.aproposmagazine.com').replace(
    /\/$/,
    ''
  );
  return `${base}/api/podcast/rss`;
}
