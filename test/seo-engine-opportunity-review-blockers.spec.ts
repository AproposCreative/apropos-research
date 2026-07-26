import { describe, expect, it } from 'vitest';
import {
  buildGscCompareWindows,
  inclusiveDaySpan,
  GSC_DATA_LAG_DAYS,
  GSC_WINDOW_DAYS,
} from '../lib/seo-engine/opportunity-engine/gsc-windows';
import { resolveLocaleFromPageUrl, publicArticleUrl } from '../lib/seo-engine/opportunity-engine/locale';
import { detectStaleSeoWrite } from '../lib/seo-engine/opportunity-engine/guardrails';
import { mapWithConcurrency } from '../lib/seo-engine/opportunity-engine/concurrency';
import { parseAutoOpportunityOptEnv } from '../lib/seo-engine/opportunity-engine/settings';
import { buildSafeMetadataProposals } from '../lib/seo-engine/opportunity-engine/proposals';
import { findForbiddenPhrases } from '../lib/seo-engine/forbidden-phrases';
import { hasVerifiedEventData } from '../lib/seo-engine/review-schema';
import { runOpportunityScan } from '../lib/seo-engine/opportunity-engine/engine';
import type { QueryPageRow } from '../lib/seo-engine/opportunity-engine/scoring';

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

describe('review blockers: locales', () => {
  it('maps /articles and /en/articles to da/en', () => {
    expect(
      resolveLocaleFromPageUrl('https://www.aproposmagazine.com/articles/demo-game')
    ).toBe('da');
    expect(
      resolveLocaleFromPageUrl('https://www.aproposmagazine.com/en/articles/demo-game')
    ).toBe('en');
    expect(publicArticleUrl('demo-game', 'en')).toContain('/en/articles/demo-game');
  });

  it('scan produces locale-correct opportunities for da + en URLs', async () => {
    const daPage = 'https://www.aproposmagazine.com/articles/demo-game';
    const enPage = 'https://www.aproposmagazine.com/en/articles/demo-game';
    const report = await runOpportunityScan({
      persist: false,
      mode: 'optimize',
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
      fetchFn: async (_id, cmsLocaleId) => ({
        id: 'item1',
        fieldData: {
          name: cmsLocaleId.includes('en') || String(cmsLocaleId).length > 0 ? 'Demo Game' : 'Demo Game',
          slug: 'demo-game',
          'seo-title': '',
          'meta-description': '',
          'article-type': 'Spilanmeldelse',
        },
        lastPublished: '2026-06-01T00:00:00.000Z',
        lastUpdated: '2026-06-02T00:00:00.000Z',
      }),
      gscFetchRows: async () => ({
        ok: true as const,
        rows: [
          row({
            query: 'demo game anmeldelse',
            page: daPage,
            impressions: 500,
            clicks: 5,
            ctr: 0.01,
            position: 11,
          }),
          row({
            query: 'demo game review',
            page: enPage,
            impressions: 400,
            clicks: 4,
            ctr: 0.01,
            position: 10,
          }),
        ],
      }),
      loadGa4Fn: async () => ({
        byPath: new Map(),
        available: false,
        setupStatus: 'skip',
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

    const locales = new Set(report.opportunities.map((o) => o.locale));
    expect(locales.has('da') || locales.has('en')).toBe(true);
    for (const opp of report.opportunities) {
      if (opp.locale === 'en') {
        expect(opp.url).toContain('/en/articles/');
        expect(opp.language).toBe('en');
        const title = opp.proposals.find((p) => p.field === 'seoTitle')?.proposedValue || '';
        if (title) expect(title.toLowerCase()).toMatch(/review/);
      }
      if (opp.locale === 'da') {
        expect(opp.url).toContain('/articles/');
        expect(opp.url).not.toContain('/en/articles/');
        const title = opp.proposals.find((p) => p.field === 'seoTitle')?.proposedValue || '';
        if (title) expect(title.toLowerCase()).toMatch(/anmeldelse/);
      }
    }
  });
});

describe('review blockers: stale-write', () => {
  it('detects editor change to SEO fields since scan', () => {
    const hit = detectStaleSeoWrite({
      scannedSeoTitle: 'Old title anmeldelse',
      scannedMetaDescription: 'Old meta that is long enough for comparison purposes here.',
      liveSeoTitle: 'Editor changed title anmeldelse',
      liveMetaDescription: 'Old meta that is long enough for comparison purposes here.',
    });
    expect(hit.stale).toBe(true);
    expect(hit.reason).toBe('editor_changed_field');
  });

  it('detects cmsLastUpdated mismatch', () => {
    const hit = detectStaleSeoWrite({
      scannedSeoTitle: 'Same',
      scannedMetaDescription: 'Same meta description text that clears the seventy char bar easily.',
      liveSeoTitle: 'Same',
      liveMetaDescription: 'Same meta description text that clears the seventy char bar easily.',
      scannedCmsLastUpdated: '2026-07-01T00:00:00.000Z',
      liveCmsLastUpdated: '2026-07-02T00:00:00.000Z',
    });
    expect(hit.stale).toBe(true);
    expect(hit.detail).toBe('cmsLastUpdated');
  });
});

describe('review blockers: event schema', () => {
  it('festival alone is not verified event location', () => {
    expect(
      hasVerifiedEventData({
        editorialTitle: 'x',
        language: 'da',
        body: 'x'.repeat(200),
        festival: 'Roskilde Festival',
        eventDate: '2026-06-28',
      })
    ).toBe(false);
    expect(
      hasVerifiedEventData({
        editorialTitle: 'x',
        language: 'da',
        body: 'x'.repeat(200),
        festival: 'Roskilde Festival',
        eventDate: '2026-06-28',
        venue: 'Dyrskuepladsen',
      })
    ).toBe(true);
  });
});

describe('review blockers: metadata quality', () => {
  it('does not naively append query or use forbidden phrases', () => {
    const proposals = buildSafeMetadataProposals({
      title: 'Astro Bot',
      signals: ['high_impressions_low_ctr', 'weak_or_missing_meta'],
      evidence: {
        query: 'astro bot anmeldelse astro bot anmeldelse astro bot',
        currentSeoTitle: null,
        currentMetaDescription: null,
        impressions: 400,
      },
      language: 'da',
      articleType: 'Spilanmeldelse',
      workName: 'Astro Bot',
    });
    const title = proposals.find((p) => p.field === 'seoTitle')?.proposedValue || '';
    expect(title.toLowerCase()).toContain('anmeldelse');
    expect((title.match(/anmeldelse/gi) || []).length).toBe(1);
    expect(title.toLowerCase()).not.toContain('anmeldelse anmeldelse');
    for (const p of proposals) {
      expect(findForbiddenPhrases(p.proposedValue)).toEqual([]);
    }
  });
});

describe('review blockers: GSC windows', () => {
  it('uses equal 28-day windows with lag and excludes today', () => {
    const now = new Date('2026-07-20T15:00:00.000Z');
    const w = buildGscCompareWindows({ now });
    expect(w.windowDays).toBe(GSC_WINDOW_DAYS);
    expect(w.lagDays).toBe(GSC_DATA_LAG_DAYS);
    expect(inclusiveDaySpan(w.currentStart, w.currentEnd)).toBe(28);
    expect(inclusiveDaySpan(w.previousStart, w.previousEnd)).toBe(28);
    expect(w.currentEnd).toBe('2026-07-17'); // today-3
    expect(w.currentEnd).not.toBe('2026-07-20');
    // previous ends the day before current starts
    expect(w.previousEnd < w.currentStart).toBe(true);
  });
});

describe('review blockers: concurrency helper', () => {
  it('bounds parallel work', async () => {
    let live = 0;
    let maxLive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async (n) => {
      live += 1;
      maxLive = Math.max(maxLive, live);
      await new Promise((r) => setTimeout(r, 5));
      live -= 1;
      return n * 2;
    });
    expect(maxLive).toBeLessThanOrEqual(3);
  });
});

describe('review blockers: kill-switch env', () => {
  it('env false is explicit emergency stop', () => {
    expect(parseAutoOpportunityOptEnv('false')).toEqual({ explicit: true, enabled: false });
  });
});
