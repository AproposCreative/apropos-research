export type DashboardPeriod = '7d' | '28d' | '90d' | '365d';

export const DASHBOARD_PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: '7d', label: 'Seneste 7 dage' },
  { id: '28d', label: 'Seneste 28 dage' },
  { id: '90d', label: 'Seneste 90 dage' },
  { id: '365d', label: 'Seneste 12 måneder' },
];

export function periodToGa4Start(period: DashboardPeriod): string {
  return `${Number.parseInt(period, 10) - 1}daysAgo`;
}

export function parseDashboardPeriod(raw: string | null | undefined): DashboardPeriod {
  if (raw === '7d' || raw === '28d' || raw === '90d' || raw === '365d') return raw;
  return '28d';
}

/** Inclusive calendar-day windows in Copenhagen, including today. */
export function dashboardDateRange(period: DashboardPeriod, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (key: string) => Number(parts.find(part => part.type === key)!.value);
  const today = new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
  const days = Number.parseInt(period, 10), start = new Date(today);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const startDate = start.toISOString().slice(0, 10), endDate = today.toISOString().slice(0, 10);
  let midnight = start.getTime();
  for (let i = 0; i < 3; i++) {
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(midnight));
    const p = (key: string) => Number(local.find(part => part.type === key)!.value);
    const displayed = Date.UTC(p('year'), p('month') - 1, p('day'), p('hour'), p('minute'), p('second'));
    midnight += start.getTime() - displayed;
  }
  return { startDate, endDate, startIso: new Date(midnight).toISOString(), endIso: now.toISOString(), timeZone: 'Europe/Copenhagen' as const };
}
