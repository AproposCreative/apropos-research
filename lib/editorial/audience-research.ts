import { runGa4Report } from '@/lib/ga4/data-client';
import { buildAudienceSignals, type ArticleTraffic, type AudienceSignal } from './audience-signals';

export type AudienceSnapshot = {
  status: 'available' | 'unavailable';
  fetchedAt: string;
  period: string;
  signals: AudienceSignal[];
  note: string;
};

/** Completed calendar days in the configured GA property timezone, not realtime. */
export async function fetchEditorialAudience(): Promise<AudienceSnapshot> {
  const fetchedAt = new Date().toISOString();
  const period = 'I går sammenlignet med dagsgennemsnittet for de syv foregående dage';
  try {
    const report = async (startDate: string, endDate: string): Promise<ArticleTraffic[]> => {
      const result = await runGa4Report({ startDate, endDate, metrics: ['screenPageViews'], dimensions: ['pagePath', 'pageTitle'] });
      if (result.rowCount > result.rows.length) throw new Error('Incomplete GA4 report');
      return result.rows.map(row => ({ path: row.dimensions[0], title: row.dimensions[1], views: Number(row.metrics[0]) }));
    };
    const [recent, baseline] = await Promise.all([report('yesterday', 'yesterday'), report('8daysAgo', '2daysAgo')]);
    return { status: 'available', fetchedAt, period, signals: buildAudienceSignals(recent, baseline), note: 'GA4-perioderapport, ikke realtime. Sen behandling kan ændre tallene. Læserinteresse er ikke kildeverifikation.' };
  } catch {
    return { status: 'unavailable', fetchedAt, period, signals: [], note: 'Analytics kunne ikke hentes. Historier prioriteres uden trafikdata, ikke ud fra antaget nul trafik.' };
  }
}
