import { describe, expect, it, vi } from 'vitest';
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
import { assertProposalsAreSafe, maybeAutoApplyOpportunities } from '../lib/seo-engine/opportunity-engine/apply';
import { runOpportunityScan } from '../lib/seo-engine/opportunity-engine/engine';
import {
  assertCmsPatchIsSafe,
  buildIdempotencyKey,
  computeOpportunityConfidence,
  evaluateAutoApplyGuardrails,
  isWithinCooldown,
} from '../lib/seo-engine/opportunity-engine/guardrails';
import {
  OPPORTUNITY_COOLDOWN_DAYS,
  OPPORTUNITY_MAX_APPLY_PER_RUN,
} from '../lib/seo-engine/opportunity-engine/constants';
import {
  parseAutoOpportunityOptEnv,
  resolveAutomaticOpportunityRuntime,
} from '../lib/seo-engine/opportunity-engine/settings';
import type { SeoOpportunity } from '../lib/seo-engine/opportunity-engine/types';

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

function sampleOpp(overrides: Partial<SeoOpportunity> = {}): SeoOpportunity {
  return {
    id: 'opp1',
    articleKey: 'wf:item1',
    itemId: 'item1',
    locale: 'da',
    slug: 'demo-game',
    title: 'Demo Game',
    url: 'https://www.aproposmagazine.com/articles/demo-game',
    status: 'open',
    score: 70,
    confidence: 0.8,
    signals: ['high_impressions_low_ctr', 'weak_or_missing_meta'],
    why: 'Høje impressions med lav CTR. Manglende meta.',
    evidence: {
      query: 'demo game anmeldelse',
      impressions: 400,
      clicks: 4,
      ctr: 0.01,
      position: 9,
      currentSeoTitle: null,
      currentMetaDescription: null,
    },
    proposals: [
      {
        field: 'seoTitle',
        currentValue: null,
        proposedValue: 'Demo Game anmeldelse',
        rationale: 'review intent',
      },
      {
        field: 'metaDescription',
        currentValue: null,
        proposedValue:
          'Demo Game anmeldelse — læs vores ærlige vurdering af gameplay, grafik og replayværdi på Apropos Magazine.',
        rationale: 'meta',
      },
    ],
    fingerprint: 'fp1',
    idempotencyKey: 'idem1',
    scanId: 'scan1',
    articleType: 'Spilanmeldelse',
    workName: 'Demo Game',
    language: 'da',
    ...overrides,
  };
}

describe('automatic default / kill-switch', () => {
  it('defaults ON when env unset', () => {
    expect(parseAutoOpportunityOptEnv(undefined).enabled).toBe(true);
    expect(parseAutoOpportunityOptEnv('').enabled).toBe(true);
  });

  it('explicit false is emergency stop', () => {
    expect(parseAutoOpportunityOptEnv('false')).toEqual({ explicit: true, enabled: false });
  });

  it('runtime requires kill-switch + healthy connections for optimize', async () => {
    const runtime = await resolveAutomaticOpportunityRuntime({
      resolveEnabled: async () => true,
      assessConnections: async () => ({
        healthy: true,
        canAutoOptimize: true,
        canAutoFillOnPublish: true,
        gsc: { ok: true, message: 'ok' },
        ga4: { ok: true, message: 'ok' },
        webflow: { ok: true, message: 'ok' },
        summary: 'all ok',
      }),
    });
    expect(runtime.shouldAutoOptimize).toBe(true);
    expect(runtime.shouldAutoFillOnPublish).toBe(true);

    const stopped = await resolveAutomaticOpportunityRuntime({
      resolveEnabled: async () => false,
      assessConnections: async () => ({
        healthy: true,
        canAutoOptimize: true,
        canAutoFillOnPublish: true,
        gsc: { ok: true, message: 'ok' },
        ga4: { ok: true, message: 'ok' },
        webflow: { ok: true, message: 'ok' },
        summary: 'all ok',
      }),
    });
    expect(stopped.shouldAutoOptimize).toBe(false);
  });
});

describe('opportunity engine scoring', () => {
  it('detects core SERP signals', () => {
    expect(
      detectHighImpressionsLowCtr(
        row({ query: 'q', page: 'p', impressions: 500, clicks: 2, ctr: 0.004 })
      )
    ).toBe(true);
    expect(detectPositionBand(row({ query: 'q', page: 'p', position: 7 }))).toBe(true);
    expect(
      detectRisingQuery({
        current: row({ query: 'a', page: '/a', impressions: 200 }),
        previous: row({ query: 'a', page: '/a', impressions: 100 }),
      })
    ).toBe(true);
    const current = aggregateByPage([
      row({ query: 'x', page: '/a', impressions: 50 }),
    ]).get('/a')!;
    const previous = aggregateByPage([
      row({ query: 'x', page: '/a', impressions: 200 }),
    ]).get('/a')!;
    expect(detectDecliningArticle({ current, previous })).toBe(true);
    expect(
      detectCannibalization({
        query: 'shared',
        pages: [
          { page: '/a', impressions: 120, clicks: 5, position: 8 },
          { page: '/b', impressions: 90, clicks: 3, position: 12 },
        ],
      }).hit
    ).toBe(true);
    expect(detectWeakOrMissingMeta({ seoTitle: null, metaDescription: null })).toBe(true);
  });

  it('builds review-aware natural titles without stuffing', () => {
    const proposals = buildSafeMetadataProposals({
      title: 'Noget langt redaktionelt',
      signals: ['weak_or_missing_meta', 'high_impressions_low_ctr'],
      evidence: {
        query: 'astro bot anmeldelse',
        currentSeoTitle: null,
        currentMetaDescription: null,
        impressions: 300,
      },
      language: 'da',
      articleType: 'Spilanmeldelse',
      workName: 'Astro Bot',
      bodyExcerpt:
        'Astro Bot er et charmerende platforms-eventyr med præcis leveldesign og varm humor, der holder hele vejen.',
    });
    const title = proposals.find((p) => p.field === 'seoTitle')?.proposedValue || '';
    expect(title.toLowerCase()).toContain('anmeldelse');
    expect(title.toLowerCase()).toContain('astro bot');
    expect((title.match(/anmeldelse/gi) || []).length).toBe(1);
    expect(() => assertProposalsAreSafe(proposals)).not.toThrow();
  });
});

describe('guardrails', () => {
  it('enforces 14-day cooldown', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    expect(
      isWithinCooldown({
        lastAppliedAt: '2026-07-10T12:00:00.000Z',
        now,
        cooldownDays: OPPORTUNITY_COOLDOWN_DAYS,
      })
    ).toBe(true);
    expect(
      isWithinCooldown({
        lastAppliedAt: '2026-06-01T12:00:00.000Z',
        now,
        cooldownDays: OPPORTUNITY_COOLDOWN_DAYS,
      })
    ).toBe(false);
  });

  it('skips low confidence', () => {
    const opp = sampleOpp({
      score: 70,
      confidence: 0.2,
      evidence: { impressions: 400, query: 'q' },
    });
    const gate = evaluateAutoApplyGuardrails({
      opportunity: opp,
      appliedCountInRun: 0,
    });
    expect(gate.allow).toBe(false);
    expect(gate.reason).toBe('low_confidence');
  });

  it('enforces batch limit of 10', () => {
    const gate = evaluateAutoApplyGuardrails({
      opportunity: sampleOpp(),
      appliedCountInRun: OPPORTUNITY_MAX_APPLY_PER_RUN,
    });
    expect(gate.allow).toBe(false);
    expect(gate.reason).toBe('batch_limit');
  });

  it('blocks overwrite of strong fields without documented opportunity', () => {
    const opp = sampleOpp({
      signals: ['weak_or_missing_meta'],
      evidence: {
        impressions: 50,
        query: 'x',
        currentSeoTitle: 'En allerede god SEO-title til artiklen',
        currentMetaDescription: null,
      },
      proposals: [
        {
          field: 'seoTitle',
          currentValue: 'En allerede god SEO-title til artiklen',
          proposedValue: 'Demo Game anmeldelse',
          rationale: 'x',
        },
      ],
    });
    const gate = evaluateAutoApplyGuardrails({
      opportunity: opp,
      appliedCountInRun: 0,
    });
    expect(gate.allow).toBe(false);
    expect(gate.reason).toBe('strong_field_without_opportunity');
  });

  it('rejects forbidden CMS fields in patch', () => {
    expect(() => assertCmsPatchIsSafe({ 'seo-title': 'ok' })).not.toThrow();
    expect(() => assertCmsPatchIsSafe({ name: 'editorial' })).toThrow(/Forbidden|unsafe/i);
    expect(() => assertCmsPatchIsSafe({ content: '<p>no</p>' })).toThrow(/Forbidden|unsafe/i);
    expect(() => assertCmsPatchIsSafe({ slug: 'nope' })).toThrow(/Forbidden|unsafe/i);
  });

  it('builds stable idempotency keys', () => {
    const a = buildIdempotencyKey({
      itemId: 'i1',
      url: 'https://www.aproposmagazine.com/articles/x',
      fingerprint: 'fp',
      proposedTitle: 'T',
      proposedMeta: 'M',
    });
    const b = buildIdempotencyKey({
      itemId: 'i1',
      url: 'https://www.aproposmagazine.com/articles/x',
      fingerprint: 'fp',
      proposedTitle: 'T',
      proposedMeta: 'M',
    });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it('confidence increases with evidence', () => {
    const low = computeOpportunityConfidence({
      score: 20,
      signals: ['query_cannibalization'],
      evidence: { impressions: 10 },
    });
    const high = computeOpportunityConfidence({
      score: 80,
      signals: ['high_impressions_low_ctr', 'weak_or_missing_meta', 'position_4_to_20'],
      evidence: {
        impressions: 500,
        query: 'astro bot anmeldelse',
        position: 8,
        ga4EngagedSessions: 40,
      },
    });
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThanOrEqual(0.65);
  });
});

describe('maybeAutoApplyOpportunities', () => {
  it('skips all when kill-switch off', async () => {
    const result = await maybeAutoApplyOpportunities({
      opportunities: [sampleOpp()],
      actor: 'test',
      runtime: {
        killSwitchEnabled: false,
        connectionsHealthyForOptimize: true,
        canAutoFillOnPublish: true,
        shouldAutoOptimize: false,
        shouldAutoFillOnPublish: false,
        connectionSummary: 'stopped',
      },
    });
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]?.reason).toBe('kill_switch_off');
  });

  it('skips when connections unhealthy', async () => {
    const result = await maybeAutoApplyOpportunities({
      opportunities: [sampleOpp()],
      actor: 'test',
      runtime: {
        killSwitchEnabled: true,
        connectionsHealthyForOptimize: false,
        canAutoFillOnPublish: true,
        shouldAutoOptimize: false,
        shouldAutoFillOnPublish: true,
        connectionSummary: 'GSC down',
      },
    });
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]?.reason).toBe('connections_unhealthy');
  });

  it('respects batch limit across candidates', async () => {
    const applyFn = vi.fn(async ({ opportunityId }: { opportunityId: string }) => ({
      opportunity: sampleOpp({ id: opportunityId, status: 'applied' }),
      versionIds: ['v1'],
    }));
    const updateStatusFn = vi.fn(async ({ id, status }: { id: string; status: string }) =>
      sampleOpp({ id, status: status as SeoOpportunity['status'] })
    );
    const opps = Array.from({ length: 12 }, (_, i) =>
      sampleOpp({
        id: `opp${i}`,
        itemId: `item${i}`,
        url: `https://www.aproposmagazine.com/articles/a-${i}`,
        fingerprint: `fp${i}`,
        idempotencyKey: `idem${i}`,
      })
    );
    const result = await maybeAutoApplyOpportunities({
      opportunities: opps,
      actor: 'test',
      runtime: {
        killSwitchEnabled: true,
        connectionsHealthyForOptimize: true,
        canAutoFillOnPublish: true,
        shouldAutoOptimize: true,
        shouldAutoFillOnPublish: true,
        connectionSummary: 'ok',
      },
      applyFn: applyFn as never,
      getUrlLastAppliedAtFn: async () => null,
      updateStatusFn: updateStatusFn as never,
    });
    expect(OPPORTUNITY_MAX_APPLY_PER_RUN).toBe(10);
    expect(result.applied).toHaveLength(10);
    expect(result.skipped.filter((s) => s.reason === 'batch_limit')).toHaveLength(2);
    expect(applyFn).toHaveBeenCalledTimes(10);
  });

  it('skips URL still in cooldown', async () => {
    const applyFn = vi.fn();
    const result = await maybeAutoApplyOpportunities({
      opportunities: [sampleOpp()],
      actor: 'test',
      now: new Date('2026-07-20T12:00:00.000Z'),
      runtime: {
        killSwitchEnabled: true,
        connectionsHealthyForOptimize: true,
        canAutoFillOnPublish: true,
        shouldAutoOptimize: true,
        shouldAutoFillOnPublish: true,
        connectionSummary: 'ok',
      },
      applyFn: applyFn as never,
      getUrlLastAppliedAtFn: async () => '2026-07-15T12:00:00.000Z',
      updateStatusFn: vi.fn(async ({ id, status }: { id: string; status: string }) =>
        sampleOpp({ id, status: status as SeoOpportunity['status'] })
      ) as never,
    });
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]?.reason).toBe('cooldown_active');
    expect(applyFn).not.toHaveBeenCalled();
  });

  it('never marks editorial fields as safe proposals', () => {
    expect(() =>
      assertProposalsAreSafe([
        {
          field: 'body' as 'seoTitle',
          currentValue: null,
          proposedValue: 'nope',
          rationale: 'bad',
        },
      ] as unknown as ReturnType<typeof buildSafeMetadataProposals>)
    ).toThrow(/Usikker field/);
  });
});

describe('idempotency + rollback safety', () => {
  it('idempotency key changes when proposed values change', () => {
    const a = buildIdempotencyKey({
      itemId: 'i1',
      url: 'https://www.aproposmagazine.com/articles/x',
      fingerprint: 'fp',
      proposedTitle: 'Title A',
      proposedMeta: 'Meta A that is long enough for SEO purposes and CTR.',
    });
    const b = buildIdempotencyKey({
      itemId: 'i1',
      url: 'https://www.aproposmagazine.com/articles/x',
      fingerprint: 'fp',
      proposedTitle: 'Title B',
      proposedMeta: 'Meta A that is long enough for SEO purposes and CTR.',
    });
    expect(a).not.toBe(b);
  });

  it('rollback CMS patch may only restore seo-title/meta-description', () => {
    expect(() =>
      assertCmsPatchIsSafe({
        'seo-title': 'old title',
        'meta-description': 'old meta restored to previous value after rollback',
      })
    ).not.toThrow();
    expect(() =>
      assertCmsPatchIsSafe({
        'seo-title': 'ok',
        name: 'must never rollback editorial',
      })
    ).toThrow(/Forbidden|unsafe|Non-SEO/i);
  });
});

describe('opportunity engine scan', () => {
  it('returns missing_gsc without inventing rows', async () => {
    const report = await runOpportunityScan({
      persist: false,
      mode: 'collect',
      gscFetchRows: async () => ({ ok: false, message: 'GSC_SITE_URL mangler' }),
      listFn: async () => [],
      loadGa4Fn: async () => ({
        byPath: new Map(),
        available: false,
        setupStatus: 'GA4 skipped in test',
      }),
      runtime: {
        killSwitchEnabled: true,
        connectionsHealthyForOptimize: false,
        canAutoFillOnPublish: true,
        shouldAutoOptimize: false,
        shouldAutoFillOnPublish: true,
        connectionSummary: 'missing gsc',
      },
      actor: 'test',
    });
    expect(report.opportunityCount).toBe(0);
    expect(report.opportunities).toEqual([]);
    expect(['missing_gsc', 'error']).toContain(report.status);
    expect(report.autoEnabled).toBe(true);
  });

  it('returns auto_disabled when kill-switch off', async () => {
    const report = await runOpportunityScan({
      persist: false,
      mode: 'optimize',
      runtime: {
        killSwitchEnabled: false,
        connectionsHealthyForOptimize: true,
        canAutoFillOnPublish: true,
        shouldAutoOptimize: false,
        shouldAutoFillOnPublish: false,
        connectionSummary: 'stopped',
      },
      actor: 'test',
    });
    expect(report.status).toBe('auto_disabled');
    expect(report.opportunityCount).toBe(0);
  });

  it('scores joined pages and caps optimize limit at 10', async () => {
    const page = 'https://www.aproposmagazine.com/articles/demo-game';
    const report = await runOpportunityScan({
      persist: false,
      mode: 'optimize',
      limit: 50,
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
          'article-type': 'Spilanmeldelse',
          content:
            '<p>Demo Game leverer et stramt gameplay-loop med skarp balance og en tone, der føles ægte hele vejen.</p>',
        },
        lastPublished: '2026-06-01T00:00:00.000Z',
        lastUpdated: '2026-06-02T00:00:00.000Z',
        isDraft: false,
      }),
      gscFetchRows: async () => ({
        ok: true as const,
        rows: [
          row({
            query: 'demo game anmeldelse',
            page,
            impressions: 500,
            clicks: 5,
            ctr: 0.01,
            position: 11,
          }),
        ],
      }),
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
      runtime: {
        killSwitchEnabled: true,
        connectionsHealthyForOptimize: true,
        canAutoFillOnPublish: true,
        shouldAutoOptimize: true,
        shouldAutoFillOnPublish: true,
        connectionSummary: 'ok',
      },
      now: () => new Date('2026-07-20T12:00:00.000Z'),
      actor: 'test',
    });
    expect(report.mode).toBe('optimize');
    expect(report.opportunityCount).toBeLessThanOrEqual(OPPORTUNITY_MAX_APPLY_PER_RUN);
    expect(report.opportunityCount).toBeGreaterThan(0);
    const opp = report.opportunities[0]!;
    expect(opp.confidence).toBeGreaterThan(0);
    expect(opp.idempotencyKey).toBeTruthy();
    expect(opp.proposals.every((p) => p.field === 'seoTitle' || p.field === 'metaDescription')).toBe(
      true
    );
    expect(opp.fingerprint).toBeTruthy();
    expect(
      opportunityFingerprint({
        page: opp.url || page,
        signals: opp.signals,
        query: opp.evidence.query,
      })
    ).toBe(opp.fingerprint);
    const meta = opp.proposals.find((p) => p.field === 'metaDescription')?.proposedValue;
    if (meta) {
      expect(meta.length).toBeGreaterThanOrEqual(70);
      expect(meta.toLowerCase()).not.toContain('fokus vurdering');
    }
  });
});
