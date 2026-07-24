import { describe, expect, it } from 'vitest';
import {
  patchRowsAfterSeoMetaApply,
  recomputeRowPriority,
} from '../lib/seo-engine/archive-audit-row-patch';

describe('Arkiv post-apply row patch', () => {
  it('clears missing seo/meta findings and updates seoTitle', () => {
    const rows = [
      {
        itemId: 'a1',
        locale: 'da',
        slug: 'sommerens-film',
        title: 'Sommerens film',
        priority: 'P0',
        seoTitle: '',
        articleTypeHint: 'Feature',
        findings: [
          { code: 'missing_seo_title', message: 'Mangler seo-title', priority: 'P0' },
          { code: 'missing_meta_description', message: 'Mangler meta', priority: 'P0' },
          {
            code: 'few_internal_links',
            message: 'Ingen interne links i længere artikel',
            priority: 'P2',
          },
          {
            code: 'weak_heading_structure',
            message: 'Få overskrifter',
            priority: 'P2',
          },
        ],
      },
    ];
    const next = patchRowsAfterSeoMetaApply(rows, [
      {
        itemId: 'a1',
        locale: 'da',
        newSeoTitle: 'Sommerens film: guide til biografhits',
        newMetaDescription:
          'En rolig guide til sommerens film — uden spoiler-støj og med konkrete anbefalinger.',
      },
    ]);
    expect(next[0]!.seoTitle).toMatch(/Sommerens film/);
    expect(next[0]!.findings.some((f) => f.code === 'missing_seo_title')).toBe(false);
    expect(next[0]!.findings.some((f) => f.code === 'missing_meta_description')).toBe(false);
    // Remaining strategic findings stay — expected until content fixes
    expect(next[0]!.findings.some((f) => f.code === 'few_internal_links')).toBe(true);
    expect(next[0]!.priority).toBe('P2');
  });

  it('keeps review_title finding when keyword still missing', () => {
    const rows = [
      {
        itemId: 'r1',
        locale: 'da',
        slug: 'film-x',
        title: 'Film X',
        priority: 'P0',
        seoTitle: 'Gammel',
        articleTypeHint: 'Filmanmeldelse',
        findings: [
          {
            code: 'review_title_keyword_missing',
            message: 'Mangler review-keyword',
            priority: 'P0',
          },
        ],
      },
    ];
    const next = patchRowsAfterSeoMetaApply(rows, [
      {
        itemId: 'r1',
        locale: 'da',
        newSeoTitle: 'Film X uden det rigtige ord',
        newMetaDescription: 'Meta der er lang nok til at undgå short_meta finding i testen her.',
      },
    ]);
    expect(next[0]!.findings.some((f) => f.code === 'review_title_keyword_missing')).toBe(true);
    expect(next[0]!.priority).toBe('P0');
  });

  it('recomputeRowPriority prefers P0', () => {
    expect(recomputeRowPriority([{ priority: 'P2' }, { priority: 'P0' }])).toBe('P0');
    expect(recomputeRowPriority([])).toBe('ok');
  });
});
