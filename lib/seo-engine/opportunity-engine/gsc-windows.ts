/**
 * GSC comparison windows: equal full periods with Search Console data lag.
 * Never includes "today"; leaves 2–3 days for GSC freshness.
 */

export const GSC_WINDOW_DAYS = 28;
/** Typical Search Console lag — end date is this many days before "now". */
export const GSC_DATA_LAG_DAYS = 3;
/** Max query×page rows across paginated GSC fetches. */
export const GSC_ROW_CAP = 10_000;
export const GSC_PAGE_SIZE = 2_500;

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const out = utcDay(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function iso(d: Date): string {
  return utcDay(d).toISOString().slice(0, 10);
}

export type GscCompareWindows = {
  windowDays: number;
  lagDays: number;
  /** Inclusive start of current 28d window. */
  currentStart: string;
  /** Inclusive end of current window (excludes today; lag applied). */
  currentEnd: string;
  /** Inclusive start of previous equal window. */
  previousStart: string;
  /** Inclusive end of previous window (day before currentStart). */
  previousEnd: string;
};

/**
 * Build two equal full windows ending `lagDays` before today (UTC).
 * Example (lag=3, window=28): current = [today-30 .. today-3], previous = [today-58 .. today-31].
 */
export function buildGscCompareWindows(args?: {
  now?: Date;
  windowDays?: number;
  lagDays?: number;
}): GscCompareWindows {
  const windowDays = args?.windowDays ?? GSC_WINDOW_DAYS;
  const lagDays = args?.lagDays ?? GSC_DATA_LAG_DAYS;
  const now = args?.now ?? new Date();
  const currentEnd = addUtcDays(now, -lagDays);
  const currentStart = addUtcDays(currentEnd, -(windowDays - 1));
  const previousEnd = addUtcDays(currentStart, -1);
  const previousStart = addUtcDays(previousEnd, -(windowDays - 1));
  return {
    windowDays,
    lagDays,
    currentStart: iso(currentStart),
    currentEnd: iso(currentEnd),
    previousStart: iso(previousStart),
    previousEnd: iso(previousEnd),
  };
}

/** Inclusive day count between ISO dates (yyyy-mm-dd). */
export function inclusiveDaySpan(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso}T00:00:00.000Z`);
  const b = Date.parse(`${endIso}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}
