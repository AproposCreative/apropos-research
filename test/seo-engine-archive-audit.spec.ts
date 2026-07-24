import { describe, expect, it } from 'vitest';
import {
  ageBucketFromDays,
  auditLocaleFields,
  buildPatternNotes,
  buildSegmentSummaries,
  classifyWinClass,
  freshnessFromDays,
  normalizePageKey,
  normalizePathKey,
  runArchiveAudit,
  selectedBatchKeys,
  slugFromPath,
  type ArchiveAuditRow,
} from '../lib/seo-engine/archive-audit';

function baseRow(partial: Partial<ArchiveAuditRow>): ArchiveAuditRow {
  return {
    itemId: 'a1',
    locale: 'da',
    cmsLocaleId: 'dk',
    slug: 'test',
    title: 'Test',
    seoTitle: 'Test seo',
    metaDescription: 'x'.repeat(80),
    published: true,
    lastPublished: '2026-06-01T00:00:00.000Z',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    articleTypeHint: 'Feature',
    canonicalUrl: 'https://www.aproposmagazine.com/test',
    explicitCanonical: false,
    ageBucket: '31-90d',
    freshness: 'fresh',
    ageDays: 50,
    findings: [],
    priority: 'ok',
    winClass: 'ok',
    gscPageMatched: false,
    gscTopQuery: null,
    gscClicks: null,
    gscImpressions: null,
    gscCtr: null,
    gscAvgPosition: null,
    ga4PageMatched: false,
    ga4PageViews: null,
    ga4EngagedSessions: null,
    wordCount: 500,
    headingCount: 3,
    internalLinkCount: 2,
    hasAuthor: true,
    hasIntro: true,
    siblingLocalePresent: true,
    ...partial,
  };
}

describe('archive-audit read-only', () => {
  it('flags missing SEO and review keyword as P0', () => {
    const findings = auditLocaleFields({
      seoTitle: 'Little Simz på Roskilde Festival 2026',
      metaDescription: '',
      language: 'da',
      articleTypeHint: 'Koncertanmeldelse',
      published: true,
      seoTitleCounts: new Map([['da:little simz på roskilde festival 2026', 1]]),
      hasAuthor: true,
      introText: 'En længere intro der dækker answerability-kravene fint nok her.',
      bodyText: 'ord '.repeat(400),
      headingCount: 4,
      internalLinkCount: 2,
      hasImageAlt: true,
      explicitCanonical: true,
      ageDays: 10,
      freshness: 'fresh',
      siblingLocalePresent: true,
      lastPublished: '2026-07-01T00:00:00.000Z',
    });
    expect(findings.some((f) => f.code === 'missing_meta_description' && f.priority === 'P0')).toBe(
      true
    );
    expect(
      findings.some((f) => f.code === 'review_title_keyword_missing' && f.priority === 'P0')
    ).toBe(true);
  });

  it('does not force review keyword on Feature', () => {
    const findings = auditLocaleFields({
      seoTitle: 'Kunst på Roskilde Festival 2026',
      metaDescription: 'Et essay om kunst og graffiti på festivalen med klare observationer.'.repeat(
        1
      ),
      language: 'da',
      articleTypeHint: 'Feature',
      published: true,
      seoTitleCounts: new Map(),
      hasAuthor: true,
      introText: 'En længere intro der dækker answerability-kravene fint nok her.',
      bodyText: 'ord '.repeat(400),
      headingCount: 4,
      internalLinkCount: 2,
      hasImageAlt: true,
      explicitCanonical: true,
      ageDays: 10,
      freshness: 'fresh',
      siblingLocalePresent: true,
      lastPublished: '2026-07-01T00:00:00.000Z',
    });
    expect(findings.some((f) => f.code === 'review_title_keyword_missing')).toBe(false);
  });

  it('flags duplicate seo titles in batch', () => {
    const findings = auditLocaleFields({
      seoTitle: 'Same Title With Enough Length',
      metaDescription: 'x'.repeat(80),
      language: 'en',
      articleTypeHint: 'Feature',
      published: true,
      seoTitleCounts: new Map([['en:same title with enough length', 2]]),
      hasAuthor: true,
      introText: 'A sufficiently long intro for answerability checks in English locale.',
      bodyText: 'word '.repeat(400),
      headingCount: 4,
      internalLinkCount: 2,
      hasImageAlt: true,
      explicitCanonical: true,
      ageDays: 10,
      freshness: 'fresh',
      siblingLocalePresent: true,
      lastPublished: '2026-07-01T00:00:00.000Z',
    });
    expect(findings.some((f) => f.code === 'duplicate_seo_title' && f.priority === 'P1')).toBe(true);
  });

  it('flags GEO author/date and stale content with geoAeo tag', () => {
    const findings = auditLocaleFields({
      seoTitle: 'Evergreen essay about culture and art in Denmark today',
      metaDescription: 'x'.repeat(80),
      language: 'da',
      articleTypeHint: 'Feature',
      published: true,
      seoTitleCounts: new Map(),
      hasAuthor: false,
      introText: 'Kort',
      bodyText: 'ord '.repeat(400),
      headingCount: 4,
      internalLinkCount: 2,
      hasImageAlt: true,
      explicitCanonical: false,
      ageDays: 500,
      freshness: 'stale',
      siblingLocalePresent: false,
      lastPublished: null,
    });
    expect(findings.some((f) => f.code === 'missing_author' && f.geoAeo)).toBe(true);
    expect(findings.some((f) => f.code === 'stale_content' && f.geoAeo)).toBe(true);
    expect(findings.some((f) => f.code === 'geo_author_date_gap')).toBe(true);
    expect(findings.some((f) => f.code === 'locale_pair_missing')).toBe(true);
  });

  it('normalizes page/path keys for joins', () => {
    expect(normalizePageKey('https://www.aproposmagazine.com/foo/')).toBe(
      'https://www.aproposmagazine.com/foo'
    );
    expect(normalizePathKey('/articles/foo/')).toBe('/articles/foo');
    expect(slugFromPath('/en/articles/bar')).toBe('bar');
  });

  it('age and freshness buckets', () => {
    expect(ageBucketFromDays(10)).toBe('0-30d');
    expect(ageBucketFromDays(60)).toBe('31-90d');
    expect(ageBucketFromDays(200)).toBe('91-365d');
    expect(ageBucketFromDays(400)).toBe('1y+');
    expect(freshnessFromDays(50)).toBe('fresh');
    expect(freshnessFromDays(200)).toBe('aging');
    expect(freshnessFromDays(400)).toBe('stale');
  });

  it('classifies quick wins vs strategic', () => {
    expect(
      classifyWinClass(
        [{ code: 'missing_seo_title', message: 'x', priority: 'P0' }],
        'P0'
      )
    ).toBe('quick_win');
    expect(
      classifyWinClass([{ code: 'stale_content', message: 'x', priority: 'P2' }], 'P2')
    ).toBe('strategic');
  });

  it('builds segments and honest pattern notes', () => {
    const rows = [
      baseRow({
        itemId: '1',
        articleTypeHint: 'Koncertanmeldelse',
        ageBucket: '0-30d',
        freshness: 'fresh',
        gscPageMatched: true,
        gscClicks: 10,
        ga4PageMatched: true,
        ga4PageViews: 100,
      }),
      baseRow({
        itemId: '2',
        articleTypeHint: 'Koncertanmeldelse',
        ageBucket: '0-30d',
        freshness: 'fresh',
        gscPageMatched: true,
        gscClicks: 2,
        findings: [
          {
            code: 'review_title_keyword_missing',
            message: 'mangler',
            priority: 'P0',
          },
        ],
        priority: 'P0',
        winClass: 'quick_win',
      }),
      baseRow({
        itemId: '3',
        articleTypeHint: 'Koncertanmeldelse',
        ageBucket: '0-30d',
        freshness: 'fresh',
        gscPageMatched: true,
        gscClicks: 8,
      }),
      baseRow({
        itemId: '4',
        freshness: 'stale',
        ageBucket: '1y+',
        ga4PageMatched: true,
        ga4PageViews: 5,
      }),
      baseRow({
        itemId: '5',
        freshness: 'stale',
        ageBucket: '1y+',
        ga4PageMatched: true,
        ga4PageViews: 3,
      }),
      baseRow({
        itemId: '6',
        freshness: 'stale',
        ageBucket: '1y+',
        ga4PageMatched: true,
        ga4PageViews: 4,
      }),
      baseRow({
        itemId: '7',
        freshness: 'fresh',
        ga4PageMatched: true,
        ga4PageViews: 50,
      }),
      baseRow({
        itemId: '8',
        freshness: 'fresh',
        ga4PageMatched: true,
        ga4PageViews: 60,
      }),
    ];
    const segments = buildSegmentSummaries(rows);
    expect(segments.length).toBeGreaterThan(0);
    const patterns = buildPatternNotes(rows);
    expect(patterns.some((p) => p.caveat.toLowerCase().includes('årsag') || p.caveat.includes('association'))).toBe(
      true
    );
  });

  it('selectedBatchKeys filters without mutating', () => {
    const rows = [baseRow({ itemId: 'a' }), baseRow({ itemId: 'b', locale: 'en' })];
    const sel = selectedBatchKeys(rows, ['a:da']);
    expect(sel).toHaveLength(1);
    expect(sel[0]?.itemId).toBe('a');
  });

  it('runArchiveAudit never writes and joins GA4/GSC when injected', async () => {
    const report = await runArchiveAudit(
      { limit: 2, locales: ['da'], measurementWindowDays: 28 },
      {
        skipGsc: true,
        skipGa4: true,
        gscByPage: new Map([
          [
            'https://www.aproposmagazine.com/lucky-apple-tv-anmeldelse',
            {
              page: 'https://www.aproposmagazine.com/lucky-apple-tv-anmeldelse',
              query: 'lucky anmeldelse',
              clicks: 12,
              impressions: 100,
              ctr: 0.12,
              averagePosition: 8,
            },
          ],
        ]),
        ga4ByPath: new Map([
          [
            '/lucky-apple-tv-anmeldelse',
            { pagePath: '/lucky-apple-tv-anmeldelse', pageViews: 220, engagedSessions: 40 },
          ],
        ]),
        listFn: async () => [
          {
            id: 'a1',
            slug: 'lucky-apple-tv-anmeldelse',
            title: 'Lucky',
            lastPublished: '2026-07-01T00:00:00.000Z',
            lastUpdated: '2026-07-01T00:00:00.000Z',
            isDraft: false,
          },
        ],
        fetchFn: async () =>
          ({
            id: 'a1',
            cmsLocaleId: 'dk',
            fieldData: {
              name: 'Lucky',
              slug: 'lucky-apple-tv-anmeldelse',
              author: 'author-ref-1',
              intro:
                'Anya Taylor-Joy bærer Apple TV+-serien Lucky med nerve og præcision i denne anmeldelse.',
              content: `<h2>Intro</h2><p>${'ord '.repeat(300)}</p><h2>Konklusion</h2><p><a href="/anden-artikel">Læs også</a></p>`,
              'seo-title': 'Lucky anmeldelse: Anya Taylor-Joy bærer serien',
              'meta-description':
                'Anya Taylor-Joy bærer Apple TV+-serien Lucky med nerve og præcision i denne anmeldelse.',
              'canonical-url': 'https://www.aproposmagazine.com/lucky-apple-tv-anmeldelse',
            },
            lastUpdated: '2026-07-01T00:00:00.000Z',
            lastPublished: '2026-07-01T00:00:00.000Z',
            isDraft: false,
          }) as never,
      }
    );
    expect(report.mode).toBe('read-only');
    expect(report.kind).toBe('archive-audit');
    expect(report.schemaVersion).toBe(2);
    expect(report.scanned).toBe(1);
    expect(report.rows[0]?.gscPageMatched).toBe(true);
    expect(report.rows[0]?.ga4PageMatched).toBe(true);
    expect(report.rows[0]?.gscTopQuery).toBe('lucky anmeldelse');
    expect(report.rows[0]?.ga4PageViews).toBe(220);
    expect(report.segments.length).toBeGreaterThan(0);
    expect(report.note.toLowerCase()).toContain('no cms writes');
  });
});
