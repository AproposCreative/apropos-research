import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ gsc: vi.fn(), site: vi.fn(), property: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/gsc/google-auth', () => ({ getConfiguredGscSiteUrl: m.site, getGscAccessToken: async () => 'test-token' }));
vi.mock('@/lib/ga4/google-auth', () => ({ getGa4AccessToken: async () => 'test-token' }));
vi.mock('@/lib/ga4/property', () => ({ getGa4PropertyResourceName: m.property }));
vi.mock('@/lib/seo-engine/search-signals', () => ({ defaultGscFetch: m.gsc, sanitizeGscQueryForPrompt: (s: string) => s.startsWith('ignore') ? null : s }));
import { readArticleGoogleContext } from '../../../lib/seo-engine/post-publish/google-context';
import { seoLanguageCheck } from '../../../lib/seo-engine/post-publish/language-check';
const url = 'https://www.aproposmagazine.com/en/articles/danielle-dahlhus---det-ma-du-ikke-sige';
const now = new Date('2026-10-14T07:00:00Z');
const ga = (values = ['12','8','4']) => new Response(JSON.stringify({ metricHeaders: ['screenPageViews','activeUsers','engagedSessions'].map(name => ({ name })), rows: [{ metricValues: values.map(value => ({ value })) }] }));
beforeEach(() => { vi.clearAllMocks(); m.site.mockReturnValue('sc-domain:aproposmagazine.com'); m.property.mockReturnValue('properties/123'); m.gsc.mockResolvedValue({ ok: true, rows: [] }); m.fetch.mockImplementation(async () => ga()); vi.stubGlobal('fetch', m.fetch); });
afterEach(() => vi.unstubAllGlobals());
it('keeps no GSC rows distinct from working GA4, with exact locale/host and dated periods', async () => {
  const r = await readArticleGoogleContext(url, now);
  expect(r.gsc).toMatchObject({ status: 'no_rows', httpStatus: 200, metrics: null, period: { startDate: '2026-09-14', endDate: '2026-10-11' } });
  expect(r.ga4).toMatchObject({ status: 'available', period: { startDate: '2026-09-16', endDate: '2026-10-13' }, metrics: { screenPageViews: 12, activeUsers: 8, engagedSessions: 4 } });
  expect(r.performanceChangeEligible).toBe(false); expect(m.gsc).toHaveBeenCalledOnce();
  expect(m.gsc.mock.calls[0][0].body.dimensionFilterGroups[0].filters[0].expression).toBe(url);
  const request = m.fetch.mock.calls[0][1], payload = JSON.parse(request.body);
  expect(request.redirect).toBe('error'); expect(request.signal).toBeInstanceOf(AbortSignal);
  expect(payload.dimensionFilter.andGroup.expressions.map((e: any) => e.filter.stringFilter.value)).toEqual(['www.aproposmagazine.com','/en/articles/danielle-dahlhus---det-ma-du-ikke-sige']);
});
it('preserves page totals even when Google omits query rows, without inventing a query', async () => {
  m.gsc.mockResolvedValueOnce({ ok: true, rows: [{ keys: [url], clicks: 3, impressions: 60, ctr: .05, position: 8 }] });
  const r = await readArticleGoogleContext(url, now);
  expect(r.gsc.status).toBe('available'); expect(r.gsc.metrics?.impressions).toBe(60); expect(r.gsc.queries).toEqual([]); expect(m.gsc).toHaveBeenCalledTimes(2);
});
it('keeps valid GSC page totals when the separate query request fails', async () => {
  m.gsc.mockResolvedValueOnce({ ok: true, rows: [{ keys: [url], clicks: 3, impressions: 60, ctr: .05, position: 8 }] }).mockRejectedValueOnce(Error('timeout'));
  const r = await readArticleGoogleContext(url, now);
  expect(r.gsc).toMatchObject({ status: 'available', queriesStatus: 'unavailable', metrics: { impressions: 60 } });
  expect(m.gsc).toHaveBeenCalledTimes(2);
});
it('rejects malformed GA4 rows rather than claiming no data', async () => {
  m.fetch.mockResolvedValue(new Response(JSON.stringify({ rows: { error: 'bad' } })));
  expect((await readArticleGoogleContext(url, now)).ga4.status).toBe('unavailable');
});
it('reports real access denial without leaking Google response text or confusing it with empty data', async () => {
  m.gsc.mockResolvedValue({ ok: false, status: 403, message: 'secret-debug-info' });
  m.fetch.mockResolvedValue(new Response('private error', { status: 403 }));
  const r = await readArticleGoogleContext(url, now);
  expect(r.gsc.status).toBe('access_denied'); expect(r.ga4.status).toBe('access_denied'); expect(JSON.stringify(r)).not.toMatch(/secret|private error/);
});
it('does not retry timeouts or replace them with fabricated zeros', async () => {
  m.gsc.mockRejectedValue(Error('timeout with token')); m.fetch.mockRejectedValue(Error('timeout'));
  const r = await readArticleGoogleContext(url, now);
  expect(r.gsc.status).toBe('unavailable'); expect(r.ga4.metrics).toBeNull(); expect(m.gsc).toHaveBeenCalledOnce(); expect(m.fetch).toHaveBeenCalledOnce();
});
it('avoids network entirely for missing configuration', async () => {
  m.site.mockReturnValue(null); m.property.mockReturnValue(null);
  const r = await readArticleGoogleContext(url, now);
  expect(r.gsc.status).toBe('not_configured'); expect(r.ga4.status).toBe('not_configured'); expect(m.fetch).not.toHaveBeenCalled(); expect(m.gsc).not.toHaveBeenCalled();
});
it.each(['', 'NaN', '-1'])('rejects invalid GA4 metric %j instead of returning zero', async value => {
  m.fetch.mockImplementation(async () => ga([value,'8','4']));
  expect((await readArticleGoogleContext(url, now)).ga4).toMatchObject({ status: 'unavailable', metrics: null });
});
it('distinguishes no GA4 rows from a measured zero', async () => {
  m.fetch.mockImplementationOnce(async () => new Response('{}'));
  expect((await readArticleGoogleContext(url, now)).ga4).toMatchObject({ status: 'no_rows', metrics: null });
  m.fetch.mockImplementationOnce(async () => ga(['0','0','0']));
  expect((await readArticleGoogleContext(url, now)).ga4).toMatchObject({ status: 'available', metrics: { screenPageViews: 0 } });
});
it.each(['http://127.0.0.1/articles/a','https://example.com/articles/a', 'https://www.aproposmagazine.com/articles/a?secret=yes'])('rejects external/ambiguous article input: %s', async value => {
  await expect(readArticleGoogleContext(value, now)).rejects.toThrow('seo_public_url_not_allowed'); expect(m.fetch).not.toHaveBeenCalled(); expect(m.gsc).not.toHaveBeenCalled();
});
it('flags a Danish body on EN without treating Danish names in an English review as a conflict', () => {
  const danish = 'Hun var på scenen og havde meget at sige men der blev ikke noget efter det som hun skulle med flere fra sig hvor lidt kunne være. '.repeat(6);
  expect(seoLanguageCheck(danish, 'en').status).toBe('locale_mismatch'); expect(seoLanguageCheck(danish,'da').status).toBe('not_flagged');
  const english = 'Danielle Dahlhus performs Det må du ikke sige. She has a natural presence and the audience enjoys her performance, but there could have been more reflection between the jokes. '.repeat(6);
  expect(seoLanguageCheck(english,'en').status).toBe('not_flagged');
  expect(seoLanguageCheck('Det må du ikke sige', 'en').status).toBe('not_flagged');
});
