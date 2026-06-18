import { getGa4AccessToken } from '@/lib/ga4/google-auth';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';

export type Ga4RunReportInput = {
  startDate: string;
  endDate: string;
  metrics: string[];
  dimensions?: string[];
};

export type Ga4RunReportResult = {
  rowCount: number;
  metricHeaders: string[];
  dimensionHeaders: string[];
  rows: Array<{ dimensions: string[]; metrics: string[] }>;
};

function parseReport(json: Record<string, unknown>): Ga4RunReportResult {
  const metricHeaders = ((json.metricHeaders as Array<{ name?: string }>) || [])
    .map((h) => h.name || '')
    .filter(Boolean);
  const dimensionHeaders = ((json.dimensionHeaders as Array<{ name?: string }>) || [])
    .map((h) => h.name || '')
    .filter(Boolean);
  const rawRows = (json.rows as Array<Record<string, unknown>>) || [];

  const rows = rawRows.map((row) => {
    const dimVals = ((row.dimensionValues as Array<{ value?: string }>) || []).map(
      (v) => v.value ?? ''
    );
    const metVals = ((row.metricValues as Array<{ value?: string }>) || []).map(
      (v) => v.value ?? ''
    );
    return { dimensions: dimVals, metrics: metVals };
  });

  return {
    rowCount: rows.length,
    metricHeaders,
    dimensionHeaders,
    rows,
  };
}

export async function runGa4Report(input: Ga4RunReportInput): Promise<Ga4RunReportResult> {
  const property = getGa4PropertyResourceName();
  if (!property) {
    throw new Error('GA4_PROPERTY_ID er ikke sat');
  }

  const token = await getGa4AccessToken();
  const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
      metrics: input.metrics.map((name) => ({ name })),
      dimensions: (input.dimensions || []).map((name) => ({ name })),
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (json.error as { message?: string } | undefined)?.message ||
      `GA4 Data API fejl ${res.status}`;
    throw new Error(msg);
  }

  return parseReport(json);
}

/** Smoke test — activeUsers seneste 7 dage. */
export async function probeGa4DataAccess(): Promise<{
  ok: boolean;
  activeUsers7d?: number;
  error?: string;
}> {
  try {
    const report = await runGa4Report({
      startDate: '7daysAgo',
      endDate: 'today',
      metrics: ['activeUsers'],
    });
    const val = Number(report.rows[0]?.metrics[0] ?? 0);
    return { ok: true, activeUsers7d: Number.isFinite(val) ? val : 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
