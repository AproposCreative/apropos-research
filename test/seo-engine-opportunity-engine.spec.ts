import { describe, expect, it } from 'vitest';
import {
  aggregateByPage,
  buildQueryToPagesIndex,
  detectCannibalization,
  detectDecliningArticle,
  detectHighImpressionsLowCtr,
  detectPositionBand,
  detectRisingQuery,
  detectWeakOrMissingMeta,
  opportunityFingerprint,
  scorePageOpportunity,
  type QueryPageRow,
} from '../lib/seo-engine/opportunity-engine/scoring';
import { buildSafeMetadataProposals } from '../lib/seo-engine/opportunity-engine/proposals';
import { assertProposalsAreSafe } from '../lib/seo-engine/opportunity-engine/apply';
import { runOpportunityScan } from '../lib/seo-engine/opportunity-engine/engine';

function row(
  partial: Partial<QueryPageRow> & Pick<QueryPageRow, 'query' | 'page'>
): QueryPageRow {
  return {
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 10,
    ...partial,
  };
}

describe('opportunity engine scoring', () => {
  it('detects high impressions / low CTR', () => {
    expect(
      detectHighImpressionsLowCtr(
        row({ query: 'q', page: 'p', impressions: 500, clicks: 2, ctr: 0.004 })
      )
    ).toBe(true);
    expect(
      detectHighImpressionsLowCtr(
        row({ query: 'q', page: 'p', impressions: 50, clicks: 5, ctr: 0.1 })
      )
    ).toBe(false);
  });

  it('detects position 4–20 band', () => {
    expect(detectPositionBand(row({ query: 'q', page: 'p', position: 7 }))).toBe(true);
    expect(detectPositionBand(row({ query: 'q', page: 'p', position: 2 }))).toBe(false);
    expect(detectPositionBand(row({ query: 'q', page: 'p', position: 25 }))).toBe(false);
  });

  it('detects rising queries across 28d windows', () => {
    const current = row({ query: 'astro bot', page: '/a', impressions: 200, clicks: 10 });
    const previous = row({ query: 'astro bot', page: '/a', impressions: 100, clicks: 8 });
    expect(detectRisingQuery({ current, previous })).toBe(true);
    expect(detectRisingQuery({ current, previous: null })).toBe(false);
  });

  it('detects declining articles', () => {
    const current = aggregateByPage([
      row({ query: 'x', page: '/a', impressions: 50, clicks: 2 }),
    ]).get('/a')!;
    const previous = aggregateByPage([
      row({ query: 'x', page: '/a', impressions: 200, clicks: 20 }),
    ]).get('/a')!;
    expect(detectDecliningArticle({ current, previous })).toBe(true);
  });

  it('detects query cannibalization', () => {
    const hit = detectCannibalization({
      query: 'shared',
      pages: [
        { page: '/a', impressions: 120, clicks: 5, position: 8 },
        { page: '/b', impressions: 90, clicks: 3, position: 12 },
      ],
    });
    expect(hit.hit).toBe(true);
    expect(hit.pages).toContain('/a');
    expect(hit.pages).toContain('/b');
  });

  it('detects weak/missing meta', () => {
    expect(detectWeakOrMissingMeta({ seoTitle: null, metaDescription: null })).toBe(true);
    expect(
      detectWeakOrMissingMeta({
        seoTitle: 'Kort',
        metaDescription: 'For kort meta',
      })
    ).toBe(true);
    expect(
      detectWeakOrMissingMeta({
        seoTitle: 'En passende SEO-title til artiklen her',
        metaDescription:
          'En meta-description der er lang nok til at beskrive indholdet uden at være for kort eller for lang i SERP.',
      })
    ).toBe(false);
  });

  it('scores a page with evidence and why', () => {
    const page = 'https://www.aproposmagazine.com/articles/astro-bot';
    const currentRows = [
      row({
        query: 'astro bot anmeldelse',
        page,
        impressions: 400,
        clicks: 4,
        ctr: 0.01,
        position: 9,
      }),
    ];
    const previousRows = [
      row({
        query: 'astro bot anmeldelse',
        page,
        impressions: 120,
        clicks: 3,
        ctr: 0.025,
        position: 14,
      }),
    ];
    const scored = scorePageOpportunity({
      page,
      currentRows,
      previousRows,
      queryToPages: buildQueryToPagesIndex(currentRows),
      seoTitle: '',
      metaDescription: '',
      ga4EngagedSessions: 40,
    });
    expect(scored).toBeTruthy();
    expect(scored!.signals).toContain('high_impressions_low_ctr');
    expect(scored!.signals).toContain('position_4_to_20');
    expect(scored!.signals).toContain('weak_or_missing_meta');
    expect(scored!.why.length).toBeGreaterThan(20);
    expect(scored!.evidence.query).toBe('astro bot anmeldelse');
    expect(scored!.score).toBeGreaterThan(30);
    expect(opportunityFingerprint(scored!)).toContain(page.toLowerCase());
  });

  it('builds safe metadata proposals only', () => {
    const proposals = buildSafeMetadataProposals({
      title: 'Astro Bot',
      signals: ['high_impressions_low_ctr', 'weak_or_missing_meta'],
      evidence: {
        query: 'astro bot anmeldelse',
        currentSeoTitle: null,
        currentMetaDescription: null,
      },
    });
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.every((p) => p.field === 'seoTitle' || p.field === 'metaDescription')).toBe(
      true
    );
    expect(() => assertProposalsAreSafe(proposals)).not.toThrow();
    expect(() =>
      assertProposalsAreSafe([
        {
          field: 'body',
          currentValue: null,
          proposedValue: 'nope',
          rationale: 'bad',
        },
      ] as unknown as typeof proposals)
    ).toThrow(/Usikker field/);
  });
});

describe('opportunity engine scan (no mock GSC data)', () => {
  it('returns missing_gsc status without inventing rows', async () => {
    const report = await runOpportunityScan({
      persist: false,
      gscFetchRows: async () => ({ ok: false, message: 'GSC_SITE_URL mangler' }),
      listFn: async () => [],
      loadGa4Fn: async () => ({
        byPath: new Map(),
        available: false,
        setupStatus: 'GA4 skipped in test',
      }),
      actor: 'test',
    });
    expect(report.opportunityCount).toBe(0);
    expect(report.opportunities).toEqual([]);
    expect(['missing_gsc', 'error']).toContain(report.status);
    expect(report.statusMessage).toMatch(/GSC/i);
  });

  it('scores joined pages from injected GSC rows', async () => {
    const page = 'https://www.aproposmagazine.com/articles/demo-game';
    const report = await runOpportunityScan({
      persist: false,
      listFn: async () => [
        {
          id: 'item1',
          slug: 'demo-game',
          title: 'Demo Game',
          lastPublished: '2026-06-01T00:00:00.000Z',
          lastUpdated: '2026-06-02T00:00:00.000Z',
          isDraft: false,
        },
      ],
      fetchFn: async () => ({
        id: 'item1',
        fieldData: {
          name: 'Demo Game',
          slug: 'demo-game',
          'seo-title': '',
          'meta-description': '',
        },
        lastPublished: '2026-06-01T00:00:00.000Z',
        lastUpdated: '2026-06-02T00:00:00.000Z',
      }),
      gscFetchRows: async ({ startDate }) => {
        const isCurrent = startDate >= '2026-06-01' || true;
        return {
          ok: true as const,
          rows: [
            row({
              query: 'demo game anmeldelse',
              page,
              impressions: isCurrent ? 500 : 100,
              clicks: isCurrent ? 5 : 8,
              ctr: isCurrent ? 0.01 : 0.08,
              position: 11,
            }),
          ],
        };
      },
      loadGa4Fn: async () => ({
        byPath: new Map([
          [
            '/articles/demo-game',
            { pagePath: '/articles/demo-game', pageViews: 200, engagedSessions: 80 },
          ],
          [
            'slug:demo-game',
            { pagePath: '/articles/demo-game', pageViews: 200, engagedSessions: 80 },
          ],
        ]),
        available: true,
        setupStatus: 'ok',
      }),
      now: () => new Date('2026-07-20T12:00:00.000Z'),
      actor: 'test',
    });
    expect(report.status === 'ok' || report.status === 'partial').toBe(true);
    expect(report.opportunityCount).toBeGreaterThan(0);
    const opp = report.opportunities[0]!;
    expect(opp.itemId).toBe('item1');
    expect(opp.why.length).toBeGreaterThan(10);
    expect(opp.evidence.impressions).toBeGreaterThan(0);
    expect(opp.proposals.some((p) => p.field === 'seoTitle' || p.field === 'metaDescription')).toBe(
      true
    );
  });
});
