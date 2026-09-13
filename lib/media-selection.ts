export interface PersonalMediaSource {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

// Compatibility for existing article-count keys and bookmarked publisher links.
const legacyHosts: Record<string, string> = {
  'soundvenue.com': 'soundvenue', 'gaffa.dk': 'gaffa', 'berlingske.dk': 'berlingske',
  'bt.dk': 'bt', 'nordic.ign.com': 'ign-nordic', 'ign.com': 'ign-nordic',
  'ekkofilm.dk': 'ekkofilm', 'markedsforing.dk': 'https-markedsforing-dk',
};
export function legacySourceKey(source: PersonalMediaSource): string | undefined {
  try { return legacyHosts[new URL(source.baseUrl).hostname.toLowerCase().replace(/^www\./, '')]; }
  catch { return undefined; }
}
export function resolveSourceFilter(sources: PersonalMediaSource[], value: string): string | undefined {
  return sources.find(source => source.id.toLowerCase() === value.toLowerCase() ||
    legacySourceKey(source) === value.toLowerCase())?.id;
}
export function sourceArticleCount(source: PersonalMediaSource, counts: Record<string, number>): number {
  return counts[source.id] ?? counts[legacySourceKey(source) || ''] ?? 0;
}
/** No default-enabled fallback and no account-ambiguous browser preferences. */
export function mediaSelection(input: unknown): PersonalMediaSource[] {
  if (!Array.isArray(input)) throw new Error('invalid_media_sources');
  return input.map(source => {
    if (!source || typeof source.id !== 'string' || !source.id ||
      typeof source.name !== 'string' || typeof source.baseUrl !== 'string' ||
      typeof source.enabled !== 'boolean') throw new Error('invalid_media_source');
    return { id: source.id, name: source.name, baseUrl: source.baseUrl, enabled: source.enabled };
  });
}

export function selectedSourceId(sources: PersonalMediaSource[], label?: string, url?: string): string | undefined {
  const host = (value: string) => { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
  if (url) {
    const articleHost = host(url);
    if (!articleHost) return undefined;
    return sources.find(source => {
      const sourceHost = host(source.baseUrl);
      return sourceHost && (articleHost === sourceHost || articleHost.endsWith('.' + sourceHost));
    })?.id;
  }
  const normalized = label?.trim().toLowerCase();
  return sources.find(source => normalized && [source.id.toLowerCase(), source.name.trim().toLowerCase()].includes(normalized))?.id;
}
