import { describe, expect, it } from 'vitest';
import { auditLocaleFields, runArchiveAudit } from '../lib/seo-engine/archive-audit';

describe('archive-audit read-only', () => {
  it('flags missing SEO and review keyword as P0', () => {
    const findings = auditLocaleFields({
      seoTitle: 'Little Simz på Roskilde Festival 2026',
      metaDescription: '',
      language: 'da',
      articleTypeHint: 'Koncertanmeldelse',
      published: true,
      seoTitleCounts: new Map([['da:little simz på roskilde festival 2026', 1]]),
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
    });
    expect(findings.some((f) => f.code === 'review_title_keyword_missing')).toBe(false);
  });

  it('flags duplicate seo titles in batch', () => {
    const findings = auditLocaleFields({
      seoTitle: 'Same Title',
      metaDescription: 'x'.repeat(80),
      language: 'en',
      articleTypeHint: 'Feature',
      published: true,
      seoTitleCounts: new Map([['en:same title', 2]]),
    });
    expect(findings.some((f) => f.code === 'duplicate_seo_title' && f.priority === 'P1')).toBe(true);
  });

  it('runArchiveAudit never writes and returns read-only report', async () => {
    const report = await runArchiveAudit(
      { limit: 2, locales: ['da'], measurementWindowDays: 28 },
      {
        skipGsc: true,
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
              'seo-title': 'Lucky anmeldelse: Anya Taylor-Joy bærer serien',
              'meta-description':
                'Anya Taylor-Joy bærer Apple TV+-serien Lucky med nerve og præcision i denne anmeldelse.',
            },
            lastUpdated: '2026-07-01T00:00:00.000Z',
            lastPublished: '2026-07-01T00:00:00.000Z',
            isDraft: false,
          }) as never,
      }
    );
    expect(report.mode).toBe('read-only');
    expect(report.kind).toBe('archive-audit');
    expect(report.scanned).toBe(1);
    expect(report.rows[0]?.priority).toBe('ok');
  });
});
