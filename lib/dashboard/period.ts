export type DashboardPeriod = '7d' | '28d' | '90d' | '365d';

export const DASHBOARD_PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: '7d', label: 'Seneste 7 dage' },
  { id: '28d', label: 'Seneste 28 dage' },
  { id: '90d', label: 'Seneste 90 dage' },
  { id: '365d', label: 'Seneste 12 måneder' },
];

export function periodToGa4Start(period: DashboardPeriod): string {
  switch (period) {
    case '7d':
      return '7daysAgo';
    case '28d':
      return '28daysAgo';
    case '90d':
      return '90daysAgo';
    case '365d':
      return '365daysAgo';
    default:
      return '28daysAgo';
  }
}

export function parseDashboardPeriod(raw: string | null | undefined): DashboardPeriod {
  if (raw === '7d' || raw === '28d' || raw === '90d' || raw === '365d') return raw;
  return '28d';
}
