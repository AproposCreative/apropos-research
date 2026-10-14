import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { getConfiguredGscSiteUrl, getGscAccessToken } from '@/lib/gsc/google-auth';
import { getGa4AccessToken } from '@/lib/ga4/google-auth';
import { getGa4PropertyResourceName } from '@/lib/ga4/property';
import { defaultGscFetch, sanitizeGscQueryForPrompt } from '@/lib/seo-engine/search-signals';
import { buildGscCompareWindows } from '@/lib/seo-engine/opportunity-engine/gsc-windows';

type Status = 'available' | 'no_rows' | 'not_configured' | 'access_denied' | 'unavailable';
type Metric = { status: Status; httpStatus?: number; metrics: Record<string, number> | null };
export type ArticleGoogleContext = {
  checkedAt: string; url: string;
  gsc: Metric & { period: { startDate: string; endDate: string }; lagDays: number;
    queriesStatus: Status | 'not_requested';
    queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }> };
  ga4: Metric & { period: { startDate: string; endDate: string } };
  performanceChangeEligible: false; note: string;
};
const state = (status: number): Status => status === 401 || status === 403 ? 'access_denied' : 'unavailable';
const numeric = (values: unknown[]): values is number[] => values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0);
const day = (now: Date, offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10);

/** Bounded read-only diagnostics, never a performance admission or a write approval.
 * Saved once with a new claim. Explicit refresh is returned separately from the
 * immutable proposal context; no automatic retries and no replacement of history. */
export function readArticleGoogleContext(publicUrl: string, now = new Date()): Promise<ArticleGoogleContext> {
  return withoutPaidAi(async () => {
    const url = new URL(publicUrl);
    if (url.origin !== 'https://www.aproposmagazine.com' || url.username || url.password || url.search || url.hash ||
      !/^\/(en\/)?articles\/[^/]+$/.test(url.pathname)) throw Error('seo_public_url_not_allowed');
    const windows = buildGscCompareWindows({ now });
    const gscPeriod = { startDate: windows.currentStart, endDate: windows.currentEnd };
    const ga4Period = { startDate: day(now, -28), endDate: day(now, -1) };
    async function gsc(): Promise<ArticleGoogleContext['gsc']> {
      const base = { period: gscPeriod, lagDays: windows.lagDays, queries: [], queriesStatus: 'not_requested' as const, metrics: null };
      const siteUrl = getConfiguredGscSiteUrl();
      if (!siteUrl) return { ...base, status: 'not_configured' };
      try {
        const token = await getGscAccessToken();
        const filter = { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: url.href }] }] };
        // Page totals first: absence of query rows alone is not absence of traffic.
        const totals = await defaultGscFetch({ siteUrl, token, body: { ...gscPeriod, ...filter, dimensions: ['page'], rowLimit: 1 } });
        if (totals.ok === false) return { ...base, status: state(totals.status), httpStatus: totals.status };
        if (!totals.rows.length) return { ...base, status: 'no_rows', httpStatus: 200 };
        const row = totals.rows[0];
        if (row.keys[0] !== url.href || !numeric([row.clicks, row.impressions, row.ctr, row.position])) return { ...base, status: 'unavailable' };
        const result = await defaultGscFetch({ siteUrl, token, body: { ...gscPeriod, ...filter, dimensions: ['query'], rowLimit: 10 } })
          .catch(() => ({ ok: false as const, status: 0, rows: [] }));
        const queries = result.ok ? result.rows.flatMap(r => {
          const query = sanitizeGscQueryForPrompt(r.keys[0]);
          return query && numeric([r.clicks, r.impressions, r.ctr, r.position])
            ? [{ query, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }] : [];
        }) : [];
        return { ...base, status: 'available', httpStatus: 200, queries,
          queriesStatus: result.ok === false ? state(result.status) : (queries.length ? 'available' : 'no_rows'),
          metrics: { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position } };
      } catch { return { ...base, status: 'unavailable' }; }
    }
    async function ga4(): Promise<ArticleGoogleContext['ga4']> {
      const base = { period: ga4Period, metrics: null };
      const property = getGa4PropertyResourceName();
      if (!property) return { ...base, status: 'not_configured' };
      try {
        const token = await getGa4AccessToken();
        const names = ['screenPageViews', 'activeUsers', 'engagedSessions'];
        const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateRanges: [ga4Period], metrics: names.map(name => ({ name })), limit: 1,
            dimensionFilter: { andGroup: { expressions: [
              { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: url.hostname } } },
              { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: url.pathname } } },
            ] } } }),
        });
        if (!response.ok) return { ...base, status: state(response.status), httpStatus: response.status };
        const json = await response.json();
        if (json.rows !== undefined && !Array.isArray(json.rows)) return { ...base, status: 'unavailable' };
        if (!json.rows?.length) return { ...base, status: 'no_rows', httpStatus: 200 };
        if (json.rows.length !== 1 || names.some((name, i) => json.metricHeaders?.[i]?.name !== name)) return { ...base, status: 'unavailable' };
        const raw = json.rows[0]?.metricValues?.map((v: { value?: string }) => v.value);
        if (!Array.isArray(raw) || raw.length !== names.length || raw.some(v => typeof v !== 'string' || !v.trim())) return { ...base, status: 'unavailable' };
        const values = raw.map(Number);
        if (!numeric(values)) return { ...base, status: 'unavailable' };
        return { ...base, status: 'available', httpStatus: 200, metrics: Object.fromEntries(names.map((name, i) => [name, values[i]])) };
      } catch { return { ...base, status: 'unavailable' }; }
    }
    const [search, analytics] = await Promise.all([gsc(), ga4()]);
    return { checkedAt: now.toISOString(), url: url.href, gsc: search, ga4: analytics, performanceChangeEligible: false as const,
      note: 'GSC og GA4 er separate datakilder med daterede perioder. no_rows betyder ingen returnerede rækker, ikke forbindelsesfejl eller dokumenteret nul trafik. GSC har datalag. Dette er artikelkontekst, ikke sammenligneligt performancegrundlag eller bevis for en SEO-effekt.' };
  });
}
