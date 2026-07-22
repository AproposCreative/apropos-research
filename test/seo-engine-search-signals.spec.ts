import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChainedSearchSignalsProvider,
  DirectGscSearchAnalyticsProvider,
  Ga4GscAggregateProvider,
  NullSearchSignalsProvider,
  clearSearchSignalsCacheForTests,
  rankGscQueryRows,
  toAnalyzePromptSearchSignals,
} from '../lib/seo-engine/search-signals';

afterEach(() => {
  clearSearchSignalsCacheForTests();
  vi.unstubAllGlobals();
});

describe('search-signals provider chain', () => {
  it('Null provider returns ingen søgedata and fabricates no queries', async () => {
    const p = new NullSearchSignalsProvider();
    const b = await p.getSignals({ seeds: ['Lucky'] });
    expect(b.signals).toEqual([]);
    expect(b.provenance.uiNote).toBe('ingen søgedata');
    expect(b.provenance.queryRowsAvailable).toBe(false);
  });

  it('GA4 aggregate provider returns site-level context only (no query fabrication)', async () => {
    const wrapped = new Ga4GscAggregateProvider(
      async (body) => {
        expect(JSON.stringify(body)).not.toMatch(/sessionGoogleOrganicQuery|googleOrganicSearchQuery/);
        expect(JSON.stringify(body)).toContain('organicGoogleSearchClicks');
        return {
          ok: true,
          rows: [{ dimensions: ['20260701'], metrics: ['10', '1000', '0.01', '8.2'] }],
        };
      },
      () => true
    );
    const b = await wrapped.getSignals({ seeds: ['Lucky'], days: 28 });
    expect(b.provenance.searchConsoleLinked).toBe(true);
    expect(b.provenance.uiNote).toBe('Search Console kun samlet via GA4');
    expect(b.provenance.queryRowsAvailable).toBe(false);
    expect(b.signals.every((s) => s.kind === 'gsc_aggregate_context')).toBe(true);
    expect(b.signals.some((s) => s.kind === 'gsc_query_opportunity')).toBe(false);
  });

  it('Direct GSC success requests query+page and preserves page provenance', async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    const p = new DirectGscSearchAnalyticsProvider({
      getSiteUrl: () => 'sc-domain:aproposmagazine.com',
      getToken: async () => 'test-token',
      gscFetch: async ({ body }) => {
        capturedBodies.push({ ...(body as Record<string, unknown>) });
        return {
          ok: true,
          rows: [
            {
              keys: ['lucky anmeldelse', '/articles/lucky-apple-tv-anmeldelse'],
              clicks: 5,
              impressions: 400,
              ctr: 0.012,
              position: 9.1,
            },
            {
              keys: ['unrelated weather', '/articles/other'],
              clicks: 50,
              impressions: 50,
              ctr: 1,
              position: 1,
            },
          ],
        };
      },
    });
    const b = await p.getSignals({ seeds: ['Lucky'], language: 'da', limit: 5 });
    const req = capturedBodies[0];
    expect(req).toBeDefined();
    expect(req!.dimensions).toEqual(['query', 'page']);
    expect(Number(req!.rowLimit)).toBeGreaterThanOrEqual(100);
    expect(Number(req!.rowLimit)).toBeLessThanOrEqual(250);
    expect(b.provenance.uiNote).toBe('Search Console søgefraser aktive');
    expect(b.provenance.queryRowsAvailable).toBe(true);
    expect(b.signals[0]?.query).toBe('lucky anmeldelse');
    expect(b.signals[0]?.page).toBe('/articles/lucky-apple-tv-anmeldelse');
    expect(b.signals.every((s) => s.kind === 'gsc_query_opportunity')).toBe(true);
  });

  it('Direct GSC permission failure does not invent queries', async () => {
    const p = new DirectGscSearchAnalyticsProvider({
      getSiteUrl: () => 'sc-domain:aproposmagazine.com',
      getToken: async () => 'test-token',
      gscFetch: async () => ({
        ok: false,
        status: 403,
        message: 'Forbidden',
      }),
    });
    const b = await p.getSignals({ seeds: ['Lucky'] });
    expect(b.signals).toEqual([]);
    expect(b.provenance.errorCode).toBe('gsc_permission_denied');
    expect(b.provenance.queryRowsAvailable).toBe(false);
  });

  it('missing GSC_SITE_URL returns clear setup status', async () => {
    const p = new DirectGscSearchAnalyticsProvider({
      getSiteUrl: () => null,
      getToken: async () => 'x',
    });
    const b = await p.getSignals({ seeds: ['Lucky'] });
    expect(b.provenance.errorCode).toBe('gsc_site_url_missing');
    expect(b.provenance.uiNote).toBe('ingen søgedata');
  });

  it('chain falls back to GA4 aggregates when direct GSC fails', async () => {
    const chain = new ChainedSearchSignalsProvider(
      new DirectGscSearchAnalyticsProvider({
        getSiteUrl: () => 'sc-domain:aproposmagazine.com',
        getToken: async () => 't',
        gscFetch: async () => ({ ok: false, status: 403, message: 'nope' }),
      }),
      new Ga4GscAggregateProvider(
        async () => ({
          ok: true,
          rows: [{ dimensions: ['d'], metrics: ['1', '100', '0.01', '7'] }],
        }),
        () => true
      ),
      false
    );
    const b = await chain.getSignals({ seeds: ['Napalm Death'], language: 'da' });
    expect(b.provenance.queryRowsAvailable).toBe(false);
    expect(b.provenance.searchConsoleLinked).toBe(true);
    expect(b.provenance.uiNote).toBe('Search Console kun samlet via GA4');
    expect(b.signals.some((s) => s.kind === 'gsc_query_opportunity')).toBe(false);
  });

  it('rank prefers entity + review keyword and low-CTR opportunities', () => {
    const ranked = rankGscQueryRows(
      [
        {
          query: 'weather today',
          clicks: 100,
          impressions: 100,
          ctr: 1,
          averagePosition: 1,
        },
        {
          query: 'little simz anmeldelse',
          clicks: 2,
          impressions: 500,
          ctr: 0.004,
          averagePosition: 8,
        },
      ],
      ['Little Simz'],
      'da'
    );
    expect(ranked[0]?.query).toBe('little simz anmeldelse');
  });

  it('prompt payload only includes real query opportunities (no aggregate stuffing into queries)', () => {
    const prompt = toAnalyzePromptSearchSignals({
      signals: [
        {
          query: '(site-aggregate)',
          kind: 'gsc_aggregate_context',
          note: 'agg',
        },
        {
          query: 'lucky anmeldelse',
          kind: 'gsc_query_opportunity',
          note: 'opp',
        },
      ],
      provenance: {
        provider: 'chain',
        period: { startDate: '2026-01-01', endDate: '2026-01-28' },
        retrievedAt: new Date().toISOString(),
        signalsAvailable: true,
        searchConsoleLinked: true,
        queryRowsAvailable: true,
        aggregateOnly: false,
        uiNote: 'Search Console søgefraser aktive',
      },
    });
    expect(prompt.signals).toHaveLength(1);
    expect(prompt.signals[0]?.query).toBe('lucky anmeldelse');
  });
});
