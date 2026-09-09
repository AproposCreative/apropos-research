/** Danish dates must not pass through the engine's US-oriented Date.parse. */
export function currentSourceDate(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const danish = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*\/\s*(\d{2}):(\d{2}))?$/);
  let timestamp: number;
  if (danish) {
    const [, d, m, y] = danish;
    timestamp = Date.UTC(Number(y), Number(m) - 1, Number(d));
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  } else {
    // Do not guess ambiguous slash dates or free-text event dates.
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T.*(?:Z|[+-]\d{2}:\d{2})$)/);
    if (!iso) return null;
    const calendar = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (calendar.getUTCFullYear() !== Number(iso[1]) || calendar.getUTCMonth() !== Number(iso[2]) - 1 || calendar.getUTCDate() !== Number(iso[3])) return null;
    timestamp = Date.parse(raw);
  }
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60000 || timestamp < now - 7 * 86400000) return null;
  return new Date(timestamp).toISOString();
}
