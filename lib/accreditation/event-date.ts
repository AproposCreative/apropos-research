/**
 * Shared event-date helpers (safe for client + server).
 * Prefer ISO calendar dates: YYYY-MM-DD.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

export function normalizeEventDate(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

  const iso = trimmed.match(ISO_DATE);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
  }

  return parseEventDateFromText(trimmed);
}

/** Parse Danish / EU date fragments from titles like "fre., 02.10.2026" or "2/10/2026". */
export function parseEventDateFromText(text: string): string | undefined {
  if (!text) return undefined;
  const blob = text.replace(/\s+/g, ' ');

  const isoInText = blob.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoInText) return normalizeEventDate(isoInText[0]);

  const dotted = blob.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (dotted) {
    const d = dotted[1].padStart(2, '0');
    const m = dotted[2].padStart(2, '0');
    return `${dotted[3]}-${m}-${d}`;
  }

  const slashed = blob.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slashed) {
    const d = slashed[1].padStart(2, '0');
    const m = slashed[2].padStart(2, '0');
    return `${slashed[3]}-${m}-${d}`;
  }

  const months: Record<string, string> = {
    jan: '01',
    januar: '01',
    feb: '02',
    februar: '02',
    mar: '03',
    marts: '03',
    apr: '04',
    april: '04',
    maj: '05',
    jun: '06',
    juni: '06',
    jul: '07',
    juli: '07',
    aug: '08',
    august: '08',
    sep: '09',
    sept: '09',
    september: '09',
    okt: '10',
    oktober: '10',
    nov: '11',
    november: '11',
    dec: '12',
    december: '12',
  };
  const named = blob.match(
    /\b(\d{1,2})\.?\s*(jan(?:uar)?|feb(?:ruar)?|mar(?:ts)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:t(?:ember)?)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(20\d{2})\b/i
  );
  if (named) {
    const key = named[2].toLowerCase().replace(/\.$/, '');
    const m = months[key];
    if (m) return `${named[3]}-${m}-${named[1].padStart(2, '0')}`;
  }

  return undefined;
}
