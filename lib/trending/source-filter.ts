import { getDefaultMediaSources } from '@/lib/getMediaSources';

/** Shared ingestion uses publisher IDs, not a user's mediaSources document ID. */
export function resolveTrendingSource(id: string, name = ''): { id: string; name: string; host?: string } {
  const normalized = (value: string) => value.trim().toLowerCase();
  const source = getDefaultMediaSources().find(s =>
    normalized(s.id) === normalized(id) || normalized(s.name) === normalized(name));
  return source ? { id: source.id, name: source.name, host: new URL(source.baseUrl).hostname.replace(/^www\./, '') }
    : { id: id.trim(), name: name.trim() || id.trim() };
}

export function matchesTrendingSource(record: { source: string; sourceName?: string; url: string }, filter: ReturnType<typeof resolveTrendingSource>) {
  if (record.source === filter.id || record.sourceName?.toLowerCase() === filter.name.toLowerCase()) return true;
  if (!filter.host) return false;
  try { return new URL(record.url).hostname.replace(/^www\./, '') === filter.host; } catch { return false; }
}
