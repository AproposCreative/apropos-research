import { describe, expect, it } from 'vitest';
import {
  applyVerifyToJob,
  buildArchiveJobFromRow,
  buildArchiveJobsFromRows,
  deriveJobStatus,
  isEnFetchNoise,
  jobStatusBadge,
  shouldSkipRowForDefaultQueue,
} from '../lib/seo-engine/archive-jobs';
import {
  proposeArchiveSeoMeta,
  proposeArchiveSeoMetaHeuristic,
} from '../lib/seo-engine/archive-seo-meta-agent';

describe('archive impact jobs lifecycle', () => {
  it('builds seo_meta + content tasks from findings', () => {
    const job = buildArchiveJobFromRow({
      itemId: 'a1',
      locale: 'da',
      title: 'Sommerens film',
      slug: 'sommerens-film',
      seoTitle: '',
      priority: 'P0',
      findings: [
        { code: 'missing_seo_title' },
        { code: 'missing_meta_description' },
        { code: 'few_internal_links' },
        { code: 'weak_heading_structure' },
      ],
      gscPageMatched: true,
      gscClicks: 12,
      gscTopQuery: 'sommer film',
    });
    expect(job).not.toBeNull();
    expect(job!.tasks.map((t) => t.kind)).toEqual([
      'seo_meta',
      'headings',
      'internal_links',
    ]);
    expect(job!.status).toBe('open');
    expect(job!.whyInQueue).toMatch(/SC 12/);
  });

  it('skips EN 404 / missing sibling from default queue', () => {
    expect(
      shouldSkipRowForDefaultQueue({
        locale: 'en',
        siblingLocalePresent: false,
        findings: [{ code: 'fetch_error', message: 'not found 404' }],
      })
    ).toBe(true);
    expect(
      isEnFetchNoise({
        locale: 'en',
        findings: [{ code: 'fetch_error', message: 'EN mangler' }],
      })
    ).toBe(true);
    expect(
      buildArchiveJobFromRow({
        itemId: 'x',
        locale: 'en',
        siblingLocalePresent: false,
        findings: [{ code: 'missing_seo_title' }],
      })
    ).toBeNull();
  });

  it('after seo_meta verify with remaining content → partial badge', () => {
    let job = buildArchiveJobFromRow({
      itemId: 'a1',
      locale: 'da',
      title: 'Sommerens film',
      slug: 'sommerens-film',
      findings: [
        { code: 'missing_seo_title' },
        { code: 'few_internal_links' },
      ],
    })!;
    job = {
      ...job,
      tasks: job.tasks.map((t) =>
        t.kind === 'seo_meta' ? { ...t, status: 'applied' as const } : t
      ),
    };
    job = applyVerifyToJob(job, {
      plannedKinds: ['seo_meta'],
      liveFindings: [{ code: 'few_internal_links' }],
      liveSeoTitle: 'Sommerens film: guide',
    });
    expect(deriveJobStatus(job.tasks)).toBe('partial');
    expect(jobStatusBadge(job).label).toMatch(/Meta OK/);
    expect(jobStatusBadge(job).label).not.toMatch(/Kritisk/i);
  });

  it('verified when all planned findings gone', () => {
    let job = buildArchiveJobFromRow({
      itemId: 'a1',
      locale: 'da',
      title: 'T',
      slug: 't',
      findings: [{ code: 'missing_seo_title' }],
    })!;
    job = applyVerifyToJob(job, {
      plannedKinds: ['seo_meta'],
      liveFindings: [],
      liveSeoTitle: 'Title ok med længde nok',
    });
    expect(job.status).toBe('verified');
    expect(jobStatusBadge(job).label).toBe('Løst');
  });

  it('counts skipped noise in batch build', () => {
    const { jobs, skipped } = buildArchiveJobsFromRows([
      {
        itemId: 'ok',
        locale: 'da',
        findings: [{ code: 'missing_seo_title' }],
      },
      {
        itemId: 'en404',
        locale: 'en',
        siblingLocalePresent: false,
        findings: [{ code: 'fetch_error', message: '404' }],
      },
    ]);
    expect(jobs).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});

describe('seo_meta agent without 2-alts', () => {
  it('heuristic never mentions alternatives fail-closed', () => {
    const p = proposeArchiveSeoMetaHeuristic({
      title: 'Sommerens film',
      language: 'da',
      articleType: 'Feature',
      bodyText: 'En lang tekst om film der fylder mere end halvfjerds tegn til meta.',
    });
    expect(p.seoTitle.length).toBeGreaterThan(5);
    expect(p.metaDescription.length).toBeGreaterThan(40);
    expect(p.mode).toBe('heuristic');
  });

  it('AI path returns one proposal without strategy pack', async () => {
    const p = await proposeArchiveSeoMeta({
      title: 'Film X',
      language: 'da',
      articleType: 'Filmanmeldelse',
      bodyHtml: '<p>Anmeldelse af Film X med plads til meta description tekst her.</p>',
      completeFn: async () =>
        JSON.stringify({
          seoTitle: 'Film X anmeldelse',
          metaDescription:
            'En ærlig anmeldelse af Film X — uden spoiler-støj og med klar anbefaling.',
        }),
    });
    expect(p.seoTitle.toLowerCase()).toMatch(/anmeldelse/);
    expect(p.mode).toBe('ai');
  });

  it('does not throw Fail closed alternatives', async () => {
    const p = await proposeArchiveSeoMeta({
      title: 'Guide',
      language: 'da',
      forceHeuristic: true,
      bodyHtml:
        '<p>Body text that is long enough for a reasonable meta description fallback here.</p>',
    });
    expect(p.seoTitle).toBeTruthy();
  });
});
