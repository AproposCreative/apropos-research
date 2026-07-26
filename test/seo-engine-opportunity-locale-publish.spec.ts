import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runOpportunityScan } from '../lib/seo-engine/opportunity-engine/engine';
import type { QueryPageRow } from '../lib/seo-engine/opportunity-engine/scoring';
import {
  craftEvidenceMeta,
  isStrongMetaCandidate,
  buildSafeMetadataProposals,
} from '../lib/seo-engine/opportunity-engine/proposals';

vi.mock('@/lib/seo-engine/settings', () => ({
  resolveAutoSeoEngineEnabled: vi.fn(async () => false),
}));

vi.mock('@/lib/seo-engine/opportunity-engine/settings', () => ({
  resolveAutomaticOpportunityRuntime: vi.fn(),
}));

vi.mock('@/lib/webflow/locale-items', () => ({
  resolveWebflowLocaleIds: () => ({ dk: 'dk-locale', en: 'en-locale' }),
  fetchArticleItemByLocale: vi.fn(),
  isWebflowLocalePublished: (item: { isDraft?: boolean; lastPublished?: string | null }) => {
    if (item.isDraft === true) return false;
    return Boolean(item.lastPublished?.trim());
  },
}));

vi.mock('@/lib/seo-engine/enqueue', () => ({
  enqueueSeoEngineJob: vi.fn(async ({ locale }: { locale?: string }) => ({
    jobId: `job-${locale || 'da'}`,
    created: true,
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { maybeEnqueueSeoEngineAfterPublish } from '../lib/seo-engine/after-publish';
import { resolveAutomaticOpportunityRuntime } from '../lib/seo-engine/opportunity-engine/settings';
import { fetchArticleItemByLocale } from '../lib/webflow/locale-items';
import { enqueueSeoEngineJob } from '../lib/seo-engine/enqueue';

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

const healthyRuntime = {
  killSwitchEnabled: true,
  connectionsHealthyForOptimize: true,
  canAutoFillOnPublish: true,
  shouldAutoOptimize: true,
  shouldAutoFillOnPublish: true,
  connectionSummary: 'ok',
};

describe('locale-specific slug mapping (DK ≠ EN slug)', () => {
  it('matches /en/articles/<en-slug> via EN list, not DK slug', async () => {
    const daPage = 'https://www.aproposmagazine.com/articles/astro-bot-anmeldelse';
    const enPage = 'https://www.aproposmagazine.com/en/articles/astro-bot-review';

    const report = await runOpportunityScan({
      persist: false,
      mode: 'optimize',
      listByLocaleFn: async (locale) => {
        if (locale === 'da') {
          return [
            {
              id: 'item1',
              slug: 'astro-bot-anmeldelse',
              title: 'Astro Bot',
              lastPublished: '2026-06-01T00:00:00.000Z',
              lastUpdated: '2026-06-02T00:00:00.000Z',
              isDraft: false,
            },
          ];
        }
        return [
          {
            id: 'item1',
            slug: 'astro-bot-review',
            title: 'Astro Bot',
            lastPublished: '2026-06-01T00:00:00.000Z',
            lastUpdated: '2026-06-02T00:00:00.000Z',
            isDraft: false,
          },
        ];
      },
      fetchFn: async (_id, cmsLocaleId) => ({
        id: 'item1',
        fieldData: {
          name: 'Astro Bot',
          slug: String(cmsLocaleId).includes('en') ? 'astro-bot-review' : 'astro-bot-anmeldelse',
          'seo-title': '',
          'meta-description': '',
          'article-type': 'Spilanmeldelse',
          content:
            '<p>Astro Bot er et charmerende platforms-eventyr med præcis leveldesign og varm humor, der holder hele vejen.</p>',
        },
        lastPublished: '2026-06-01T00:00:00.000Z',
        lastUpdated: '2026-06-02T00:00:00.000Z',
        isDraft: false,
      }),
      gscFetchRows: async () => ({
        ok: true as const,
        rows: [
          row({
            query: 'astro bot anmeldelse',
            page: daPage,
            impressions: 500,
            clicks: 5,
            ctr: 0.01,
            position: 11,
          }),
          row({
            query: 'astro bot review',
            page: enPage,
            impressions: 420,
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
      runtime: healthyRuntime,
      now: () => new Date('2026-07-20T12:00:00.000Z'),
      actor: 'test',
    });

    const da = report.opportunities.find((o) => o.locale === 'da');
    const en = report.opportunities.find((o) => o.locale === 'en');
    expect(da).toBeTruthy();
    expect(en).toBeTruthy();
    expect(da!.slug).toBe('astro-bot-anmeldelse');
    expect(en!.slug).toBe('astro-bot-review');
    expect(en!.url).toContain('/en/articles/astro-bot-review');
    expect(da!.url).toContain('/articles/astro-bot-anmeldelse');
    expect(da!.url).not.toContain('/en/');
  });
});

describe('after-publish: only published locales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAutomaticOpportunityRuntime).mockResolvedValue(healthyRuntime);
  });

  it('DK published + EN draft/unpublished => only DK job', async () => {
    vi.mocked(fetchArticleItemByLocale).mockImplementation(async (_id, cmsLocaleId) => {
      if (cmsLocaleId === 'en-locale') {
        return {
          id: 'item1',
          fieldData: { name: 'Title EN', 'seo-title': '', 'meta-description': '' },
          lastUpdated: '2026-07-01T00:00:00.000Z',
          lastPublished: null,
          isDraft: true,
        };
      }
      return {
        id: 'item1',
        fieldData: { name: 'Title DK', 'seo-title': '', 'meta-description': '' },
        lastUpdated: '2026-07-01T00:00:00.000Z',
        lastPublished: '2026-07-01T00:00:00.000Z',
        isDraft: false,
      };
    });

    const result = await maybeEnqueueSeoEngineAfterPublish({
      itemId: 'item1',
      locales: ['da', 'en'],
    });
    expect(result.enqueued).toBe(true);
    expect(result.jobIds).toEqual(['job-da']);
    expect(enqueueSeoEngineJob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueueSeoEngineJob).mock.calls[0]![0]).toMatchObject({ locale: 'da' });
    expect(result.skippedLocales?.some((s) => s.locale === 'en' && s.reason === 'locale_not_published')).toBe(
      true
    );
  });
});

describe('auto-meta quality (Danish)', () => {
  it('rejects formulaic fokus vurdering / hos Apropos filler', () => {
    expect(
      isStrongMetaCandidate(
        'Astro Bot anmeldelse hos Apropos Magazine — fokus vurdering af håndværk, tone og om det holder.'
      )
    ).toBe(false);
    expect(craftEvidenceMeta({
      language: 'da',
      isReview: true,
      workName: 'Astro Bot',
      bodyExcerpt: '',
      heuristicMeta:
        'Astro Bot anmeldelse hos Apropos Magazine — fokus vurdering af håndværk, tone og om det holder.',
    })).toBeNull();
  });

  it('uses strong body excerpt and skips when quality is low', () => {
    const strong =
      'Astro Bot er et charmerende platforms-eventyr med præcis leveldesign og varm humor, der holder hele vejen.';
    expect(isStrongMetaCandidate(strong)).toBe(true);

    const proposals = buildSafeMetadataProposals({
      title: 'Astro Bot',
      signals: ['weak_or_missing_meta', 'high_impressions_low_ctr'],
      evidence: {
        query: 'astro bot anmeldelse',
        currentSeoTitle: null,
        currentMetaDescription: null,
        impressions: 400,
      },
      language: 'da',
      articleType: 'Spilanmeldelse',
      workName: 'Astro Bot',
      bodyExcerpt: strong,
    });
    const meta = proposals.find((p) => p.field === 'metaDescription')?.proposedValue || '';
    expect(meta.toLowerCase()).toContain('platforms-eventyr');
    expect(meta.toLowerCase()).not.toContain('fokus vurdering');

    const weak = buildSafeMetadataProposals({
      title: 'Astro Bot',
      signals: ['weak_or_missing_meta'],
      evidence: {
        query: 'astro bot anmeldelse',
        currentSeoTitle: null,
        currentMetaDescription: null,
        impressions: 50,
      },
      language: 'da',
      articleType: 'Spilanmeldelse',
      workName: 'Astro Bot',
      bodyExcerpt: 'Kort.',
    });
    expect(weak.find((p) => p.field === 'metaDescription')).toBeUndefined();
  });
});
