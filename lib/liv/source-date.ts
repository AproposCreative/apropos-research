/** Danish dates must not pass through the engine's US-oriented Date.parse. */
export function currentSourceDate(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string' || !Number.isFinite(now)) return null;
  const raw = value.trim();
  const danish = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*\/\s*(\d{2}):(\d{2}))?$/);
  let timestamp: number;
  if (danish) {
    const [, d, m, y, hours, minutes] = danish;
    timestamp = Date.UTC(Number(y), Number(m) - 1, Number(d));
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
    if (hours !== undefined) {
      if (Number(hours) > 23 || Number(minutes) > 59) return null;
      const wallTime = timestamp + Number(hours) * 3600000 + Number(minutes) * 60000;
      // Match both Danish UTC offsets against the actual IANA timezone rules.
      // Nonexistent spring times and ambiguous autumn times must not be guessed.
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      });
      const matches = [1, 2].map(offset => wallTime - offset * 3600000).filter(candidate => {
        const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]));
        return Number(parts.year) === Number(y) && Number(parts.month) === Number(m)
          && Number(parts.day) === Number(d) && parts.hour === hours && parts.minute === minutes;
      });
      if (matches.length !== 1) return null;
      timestamp = matches[0];
    }
  } else {
    // Do not guess ambiguous slash dates or free-text event dates.
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/);
    if (!iso) return null;
    const calendar = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (calendar.getUTCFullYear() !== Number(iso[1]) || calendar.getUTCMonth() !== Number(iso[2]) - 1 || calendar.getUTCDate() !== Number(iso[3])) return null;
    timestamp = Date.parse(raw);
  }
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60000 || timestamp < now - 7 * 86400000) return null;
  return new Date(timestamp).toISOString();
}
