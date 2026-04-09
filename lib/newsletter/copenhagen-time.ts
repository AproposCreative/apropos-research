/** Hjælpere til Europe/Copenhagen (fredags-cron, ISO-uge for idempotens). */

const TZ = 'Europe/Copenhagen';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Kalenderdato (år, måned 1–12, dag) som «nu» opleves i København. */
export function getCopenhagenYmd(now = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || '0');
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Ugenavn i København: 1 = mandag … 7 = søndag (ISO). */
export function getCopenhagenIsoWeekday(now = new Date()): number {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[w] ?? 0;
}

/** Time 0–23 i København. Bruger formatToParts — `.format()` kan give NBSP/tegn så parseInt → NaN → 0 (ødelægger tidsgitter). */
export function getCopenhagenHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const raw = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const n = Number.parseInt(raw.replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return 0;
  if (n === 24) return 0;
  return Math.min(23, Math.max(0, n));
}

/** Minut 0–59 i København. */
export function getCopenhagenMinute(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    minute: '2-digit',
  }).formatToParts(now);
  return Number.parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10) || 0;
}

/**
 * ISO-uge og ISO-år for en given gregoriansk dato (år, måned, dag) — samme uge som ISO 8601.
 * Bruger UTC-midt på dagen for at undgå DST-problemer.
 */
export function isoWeekYearAndNumberForCalendarDate(y: number, m: number, d: number): {
  isoYear: number;
  isoWeek: number;
} {
  const t = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const isoYear = t.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
  return { isoYear, isoWeek: weekNo };
}

/** ISO-uge for «nu» i København (til idempotens-nøgle for auto-fredag). */
export function getCopenhagenIsoWeekKey(now = new Date()): string {
  const { y, m, d } = getCopenhagenYmd(now);
  const { isoYear, isoWeek } = isoWeekYearAndNumberForCalendarDate(y, m, d);
  return `${isoYear}-W${pad2(isoWeek)}`;
}

/** Fredag i København og klokken er mindst `minHour` (standard 12). */
export function isCopenhagenFridayAtOrAfterHour(
  now = new Date(),
  minHour = 12
): boolean {
  return getCopenhagenIsoWeekday(now) === 5 && getCopenhagenHour(now) >= minHour;
}

/** Given ISO-ugedag (1–7) og lokalt klokkeslæt i København — er «nu» på den ugedag og ≥ HH:MM? */
export function isCopenhagenWeekdayAtOrAfterSchedule(
  now: Date,
  weekdayIso: number,
  scheduleHour: number,
  scheduleMinute: number
): boolean {
  if (getCopenhagenIsoWeekday(now) !== weekdayIso) return false;
  const h = getCopenhagenHour(now);
  const m = getCopenhagenMinute(now);
  if (h > scheduleHour) return true;
  if (h < scheduleHour) return false;
  return m >= scheduleMinute;
}

/**
 * Minutter siden planlagte ugetidspunkt (kun den pågældende ISO-ugedag i København).
 * 0 hvis forkert ugedag eller klokken endnu ikke har ramt HH:MM.
 */
export function copenhagenMinutesPastWeeklySlot(
  now: Date,
  weekdayIso: number,
  scheduleHour: number,
  scheduleMinute: number
): number {
  if (getCopenhagenIsoWeekday(now) !== weekdayIso) return 0;
  const h = getCopenhagenHour(now);
  const m = getCopenhagenMinute(now);
  const cur = h * 60 + m;
  const sch = scheduleHour * 60 + scheduleMinute;
  if (cur < sch) return 0;
  return cur - sch;
}
