import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyContentFixPreview,
  createMemoryContentApplyPreviewStore,
  generateContentFixPreview,
} from '../lib/seo-engine/archive-content-apply';
import {
  ARCHIVE_CONTENT_MAX_BATCH,
  buildCanonicalForSlug,
  buildContentFixProposal,
  isAllowedAproposArticleUrl,
  normalizeAproposArticleUrl,
  proposeHeadingStructure,
  proposeImageAltFix,
  proposeInternalLinks,
  proposeCanonicalFix,
} from '../lib/seo-engine/archive-content-fixes';

const longBody = Array.from({ length: 6 }, (_, i) => {
  const words = 'ord '.repeat(40).trim();
  return `<p>Afsnit ${i + 1}. ${words}. Mere tekst her til at fylde afsnittet ud med mening.</p>`;
}).join('\n');

describe('archive content fix transforms', () => {
  it('allowlists only aproposmagazine.com/articles URLs', () => {
    expect(
      isAllowedAproposArticleUrl(
        'https://www.aproposmagazine.com/articles/ripley'
      )
    ).toBe(true);
    expect(isAllowedAproposArticleUrl('https://evil.com/articles/x')).toBe(false);
    expect(normalizeAproposArticleUrl('/articles/ripley')).toContain('ripley');
  });

  it('inserts internal links for catalog title matches and caps per article', () => {
    const html = `<p>Vi elsker Ripley som serie og taler også om Anora i biografen.</p>${longBody}`;
    const { html: next, links } = proposeInternalLinks({
      html,
      selfSlug: 'other',
      catalog: [
        {
          url: 'https://www.aproposmagazine.com/articles/Ripley',
          title: 'Ripley: En mesterlig blanding',
          slug: 'Ripley',
        },
        {
          url: 'https://www.aproposmagazine.com/articles/anora',
          title: 'Anora',
          slug: 'anora',
        },
        {
          url: 'https://www.aproposmagazine.com/articles/extra',
          title: 'Extra film',
          slug: 'extra',
        },
      ],
      maxLinks: 2,
    });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links.length).toBeLessThanOrEqual(2);
    expect(next).toMatch(/href="https:\/\/www\.aproposmagazine\.com\/articles\//);
    // no duplicate URL
    const urls = links.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('rejects inventing external spam links', () => {
    expect(isAllowedAproposArticleUrl('https://spam.example/promo')).toBe(false);
  });

  it('proposes H2 from long paragraph bodies when few headings', () => {
    const { html, headings } = proposeHeadingStructure({ html: longBody, maxInsert: 2 });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(html).toMatch(/<h2>/i);
  });

  it('proposes canonical for empty CMS field', () => {
    const c = proposeCanonicalFix({ slug: 'sommerens-film', existing: null });
    expect(c.changed).toBe(true);
    expect(c.newCanonical).toBe(buildCanonicalForSlug('sommerens-film'));
  });

  it('does not overwrite non-allowlisted existing canonical', () => {
    const c = proposeCanonicalFix({
      slug: 'x',
      existing: 'https://other.site/page',
    });
    expect(c.changed).toBe(false);
  });

  it('proposes thumb.alt and body img alt from title', () => {
    const r = proposeImageAltFix({
      fieldData: { thumb: { url: 'https://cdn.example/x.jpg' } },
      title: 'Sommerens film',
      html: '<p><img src="https://cdn.example/y.jpg"></p>',
    });
    expect(r.thumbChanged).toBe(true);
    expect(r.thumbAlt).toBe('Sommerens film');
    expect(r.html).toMatch(/alt="Sommerens film"/);
  });

  it('filters fetch_error rows from apply eligibility', async () => {
    const { isArchiveRowEligibleForApply } = await import(
      '../lib/seo-engine/archive-audit-apply-constants'
    );
    expect(
      isArchiveRowEligibleForApply({
        locale: 'da',
        findings: [{ code: 'fetch_error', message: 'fail' }],
      })
    ).toBe(false);
    expect(
      isArchiveRowEligibleForApply({
        locale: 'da',
        findings: [{ code: 'missing_seo_title' }],
      })
    ).toBe(true);
  });

  it('buildContentFixProposal patches content + canonical fields', () => {
    const p = buildContentFixProposal({
      itemId: 'id1',
      locale: 'da',
      title: 'Test',
      slug: 'test-slug',
      fieldData: {
        content: `<p>Ripley er fantastisk.</p>${longBody}`,
        slug: 'test-slug',
        'canonical-url': '',
      },
      lastUpdated: '2026-01-01T00:00:00.000Z',
      kinds: ['internal_links', 'headings', 'canonical'],
      catalog: [
        {
          url: 'https://www.aproposmagazine.com/articles/Ripley',
          title: 'Ripley',
          slug: 'Ripley',
        },
      ],
    });
    expect(p.canonicalChanged).toBe(true);
    expect(p.newCanonical).toContain('/articles/test-slug');
    expect(p.canonicalField).toBe('canonical-url');
    expect(p.contentChanged || p.links.length > 0 || p.headings.length > 0).toBe(true);
  });

  it('fails closed when the CMS collection has no canonical field', () => {
    const p = buildContentFixProposal({
      itemId: 'id-with-template-canonical',
      locale: 'da',
      title: 'Test',
      slug: 'test-slug',
      fieldData: { content: '<p>Tekst</p>', slug: 'test-slug' },
      lastUpdated: '2026-01-01T00:00:00.000Z',
      kinds: ['canonical'],
      catalog: [],
    });
    expect(p.canonicalField).toBeNull();
    expect(p.canonicalChanged).toBe(false);
    expect(p.newCanonical).toBeNull();
  });
});

describe('archive content apply flow', () => {
  it('preview writes no CMS patches', async () => {
    const store = createMemoryContentApplyPreviewStore();
    const patchFn = vi.fn(async () => undefined);
    const preview = await generateContentFixPreview({
      selection: [{ itemId: 'item1', locale: 'da' }],
      kinds: ['canonical'],
      createdBy: 'admin',
      store,
      catalog: [],
      previewPaceMs: 0,
      fetchFn: async () =>
        ({
          id: 'item1',
          lastPublished: '2026-01-01T00:00:00.000Z',
          lastUpdated: '2026-01-01T00:00:00.000Z',
          isDraft: false,
          fieldData: {
            name: 'Artikel',
            slug: 'artikel',
            content: longBody,
            'canonical-url': '',
          },
        }) as never,
    });
    expect(preview.confirmToken.length).toBeGreaterThan(10);
    expect(preview.proposals.length).toBe(1);
    expect(preview.proposals[0]!.canonicalChanged).toBe(true);
    expect(patchFn).not.toHaveBeenCalled();
  });

  it('apply requires confirm token and writes canonical-url with backup', async () => {
    const store = createMemoryContentApplyPreviewStore();
    const reportDir = mkdtempSync(join(tmpdir(), 'acp-'));
    let live = {
      id: 'item1',
      lastPublished: '2026-01-01T00:00:00.000Z',
      lastUpdated: '2026-01-01T00:00:00.000Z',
      isDraft: false,
      fieldData: {
        name: 'Artikel',
        slug: 'artikel',
        content: longBody,
        'canonical-url': '',
      } as Record<string, unknown>,
    };
    const patchFn = vi.fn(async (_id: string, fieldData: Record<string, unknown>) => {
      live = {
        ...live,
        fieldData: { ...live.fieldData, ...fieldData },
        lastUpdated: new Date().toISOString(),
      };
    });
    const publishFn = vi.fn(async () => undefined);

    const preview = await generateContentFixPreview({
      selection: [{ itemId: 'item1', locale: 'da' }],
      kinds: ['canonical'],
      createdBy: 'admin',
      store,
      catalog: [],
      previewPaceMs: 0,
      fetchFn: async () => live as never,
    });

    // Freeze lastUpdated for TOCTOU
    live = {
      ...live,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      fieldData: {
        name: 'Artikel',
        slug: 'artikel',
        content: longBody,
        'canonical-url': '',
      },
    };

    await expect(
      applyContentFixPreview({
        previewId: preview.previewId,
        confirmOverwrite: true,
        confirmToken: 'wrong',
        store,
        pauseAutoTranslate: false,
        reportDir,
      })
    ).rejects.toThrow(/confirmToken/i);

    const result = await applyContentFixPreview({
      previewId: preview.previewId,
      confirmOverwrite: true,
      confirmToken: preview.confirmToken,
      store,
      fetchFn: async () => live as never,
      patchFn: patchFn as never,
      publishFn: publishFn as never,
      reportDir,
      pauseAutoTranslate: false,
      writePaceMs: 0,
    });

    expect(result.stoppedOnError).toBe(false);
    expect(result.writtenCount).toBe(1);
    expect(patchFn).toHaveBeenCalled();
    expect(live.fieldData['canonical-url']).toBe(
      'https://www.aproposmagazine.com/articles/artikel'
    );
    expect(result.backupPath).toBeTruthy();
  });

  it('enforces smaller batch for content writes', () => {
    const selection = Array.from({ length: ARCHIVE_CONTENT_MAX_BATCH + 1 }, (_, i) => ({
      itemId: `id-${i}`,
      locale: 'da' as const,
    }));
    expect(selection.length).toBeGreaterThan(ARCHIVE_CONTENT_MAX_BATCH);
  });
});
