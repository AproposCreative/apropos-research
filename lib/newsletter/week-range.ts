/** ISO week: Monday 00:00 UTC … Sunday 23:59:59.999 UTC (aligns with typical weekly digests). */

function startOfIsoWeekMondayUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0 Sun .. 6 Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + mondayOffset);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function isoWeekNumberUtc(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +y) / 86400000 + 1) / 7);
}

export type WeekRange = {
  start: Date;
  end: Date;
  /** Human label, e.g. 6.–12. jan. 2026 */
  labelDa: string;
  isoWeek: number;
};

function formatDaRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${fmt.format(start).replace(/\.$/, '')} – ${fmt.format(end).replace(/\.$/, '')}`;
}

/** Calendar week before the one containing `reference` (UTC ISO weeks). */
export function getPreviousIsoWeekRange(reference = new Date()): WeekRange {
  const thisMonday = startOfIsoWeekMondayUtc(reference);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const prevSunday = new Date(thisMonday);
  prevSunday.setUTCDate(prevSunday.getUTCDate() - 1);
  prevSunday.setUTCHours(23, 59, 59, 999);
  return {
    start: prevMonday,
    end: prevSunday,
    labelDa: formatDaRange(prevMonday, prevSunday),
    isoWeek: isoWeekNumberUtc(prevMonday),
  };
}
