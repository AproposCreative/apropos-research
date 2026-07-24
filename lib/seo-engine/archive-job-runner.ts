/**
 * Run Arkiv job tasks: preview (Løs) + apply + CMS verify.
 * seo_meta uses dedicated agent (no 2-alts). Content uses deterministic fixes.
 */

import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ARCHIVE_APPLY_BACKUP_COL,
  ARCHIVE_APPLY_SYSTEM_USER,
  ARCHIVE_APPLY_WEBFLOW_BUSY_DA,
} from '@/lib/seo-engine/archive-audit-apply-constants';
import {
  applyVerifyToJob,
  markTasksApplied,
  markTasksFailed,
  resolvePreviewKinds,
  type ArchiveJob,
  type ArchiveJobTaskKind,
} from '@/lib/seo-engine/archive-jobs';
import { proposeArchiveSeoMeta } from '@/lib/seo-engine/archive-seo-meta-agent';
import {
  buildContentFixProposal,
  type ContentFixKind,
  type ContentFixProposal,
  type InternalLinkCatalogEntry,
} from '@/lib/seo-engine/archive-content-fixes';
import { auditLocaleFields } from '@/lib/seo-engine/archive-audit';
import { ensureSeoEngineBackfillDir } from '@/lib/seo-engine/backfill-paths';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  buildLocaleBackup,
  buildOverwriteSeoEngineInput,
  exactReadbackMatch,
  readCmsSeoPair,
  withTransientFetchRetry,
  type BackfillLocaleCode,
} from '@/lib/seo-engine/overwrite-backfill';
import {
  fetchArticleItemByLocale,
  isWebflowLocalePublished,
  patchArticleFieldDataForLocale,
  publishArticleItemForLocale,
  resolveWebflowLocaleIds,
  type WebflowLocaleItem,
} from '@/lib/webflow/locale-items';
import {
  resolveAutoTranslateEnabled,
  setAutoTranslateEnabled,
} from '@/lib/webflow/article-translation-settings';
import { getCmsSeoSlugs } from '@/lib/seo-engine/webflow-adapter';
import { saveArchiveJob } from '@/lib/seo-engine/archive-job-store';

export type ArchiveJobPreviewResult = {
  jobId: string;
  kinds: ArchiveJobTaskKind[];
  summary: string;
  seoMeta?: {
    oldSeoTitle: string | null;
    oldMetaDescription: string | null;
    newSeoTitle: string;
    newMetaDescription: string;
  };
  content?: {
    links: number;
    headings: number;
    canonicalChanged: boolean;
    thumbAltChanged: boolean;
    newCanonical?: string | null;
    newThumbAlt?: string | null;
  };
  confirmToken: string;
  frozen: {
    itemId: string;
    locale: BackfillLocaleCode;
    cmsLocaleId: string;
    newSeoTitle?: string;
    newMetaDescription?: string;
    contentProposal?: ContentFixProposal;
  };
};

const previewTokens = new Map<
  string,
  { token: string; expires: number; preview: ArchiveJobPreviewResult }
>();

function tokenKey(jobId: string) {
  return jobId;
}

export function storeJobPreview(preview: ArchiveJobPreviewResult): void {
  previewTokens.set(tokenKey(preview.jobId), {
    token: preview.confirmToken,
    expires: Date.now() + 2 * 60 * 60 * 1000,
    preview,
  });
}

export function getJobPreview(
  jobId: string,
  confirmToken: string
): ArchiveJobPreviewResult | null {
  const hit = previewTokens.get(tokenKey(jobId));
  if (!hit || hit.token !== confirmToken) return null;
  if (Date.now() > hit.expires) {
    previewTokens.delete(tokenKey(jobId));
    return null;
  }
  return hit.preview;
}

function contentKindsFrom(kinds: ArchiveJobTaskKind[]): ContentFixKind[] {
  const out: ContentFixKind[] = [];
  for (const k of kinds) {
    if (k === 'seo_meta') continue;
    out.push(k as ContentFixKind);
  }
  return out;
}

function fieldSlug(name: 'content' | 'canonical' | 'thumb'): string {
  if (name === 'content') return 'content';
  if (name === 'canonical') return 'canonical-url';
  return 'thumb';
}

export async function previewArchiveJob(args: {
  job: ArchiveJob;
  kinds?: ArchiveJobTaskKind[] | null;
  catalog?: InternalLinkCatalogEntry[];
  fetchFn?: typeof fetchArticleItemByLocale;
  proposeSeoMetaFn?: typeof proposeArchiveSeoMeta;
}): Promise<ArchiveJobPreviewResult> {
  const kinds = resolvePreviewKinds(args.job, args.kinds);
  if (!kinds.length) {
    throw Object.assign(new Error('Ingen åbne tasks at løse'), { code: 'invalid_input' });
  }

  const localeIds = resolveWebflowLocaleIds();
  const cmsLocaleId = args.job.locale === 'en' ? localeIds.en : localeIds.dk;
  const baseFetch = args.fetchFn || fetchArticleItemByLocale;
  const fetchFn = withTransientFetchRetry(baseFetch, {
    onRetry: () => undefined,
  });

  let live: WebflowLocaleItem;
  try {
    live = await fetchFn(args.job.itemId, cmsLocaleId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|too many requests|rate.?limit/i.test(msg)) {
      throw Object.assign(new Error(ARCHIVE_APPLY_WEBFLOW_BUSY_DA), { code: 'rate_limited' });
    }
    throw err;
  }

  if (!isWebflowLocalePublished(live)) {
    throw Object.assign(new Error('Artiklen er ikke publiceret'), { code: 'invalid_input' });
  }

  const confirmToken = randomBytes(16).toString('hex');
  const oldPair = readCmsSeoPair(live.fieldData);
  const result: ArchiveJobPreviewResult = {
    jobId: args.job.jobId,
    kinds,
    summary: '',
    confirmToken,
    frozen: {
      itemId: args.job.itemId,
      locale: args.job.locale,
      cmsLocaleId,
    },
  };

  const parts: string[] = [];

  if (kinds.includes('seo_meta')) {
    const input = buildOverwriteSeoEngineInput({
      fieldData: live.fieldData,
      language: args.job.locale,
    });
    const propose = args.proposeSeoMetaFn || proposeArchiveSeoMeta;
    const proposal = await propose({
      title: args.job.title || input.editorialTitle || args.job.slug,
      slug: args.job.slug,
      bodyHtml: input.body || '',
      language: args.job.locale,
      articleType: args.job.articleTypeHint || input.articleType,
      oldSeoTitle: oldPair.seoTitle,
      oldMetaDescription: oldPair.metaDescription,
    });
    result.seoMeta = {
      oldSeoTitle: oldPair.seoTitle,
      oldMetaDescription: oldPair.metaDescription,
      newSeoTitle: proposal.seoTitle,
      newMetaDescription: proposal.metaDescription,
    };
    result.frozen.newSeoTitle = proposal.seoTitle;
    result.frozen.newMetaDescription = proposal.metaDescription;
    parts.push(`SEO-title → «${proposal.seoTitle.slice(0, 48)}…»`);
  }

  const cKinds = contentKindsFrom(kinds);
  if (cKinds.length) {
    const proposal = buildContentFixProposal({
      itemId: args.job.itemId,
      locale: args.job.locale,
      title: args.job.title,
      slug: args.job.slug,
      fieldData: live.fieldData as Record<string, unknown>,
      lastUpdated: live.lastUpdated ?? null,
      kinds: cKinds,
      catalog: args.catalog || [],
    });

    if (
      !proposal.contentChanged &&
      !proposal.canonicalChanged &&
      !proposal.thumbAltChanged
    ) {
      if (!kinds.includes('seo_meta')) {
        throw Object.assign(new Error('Ingen content-ændringer at foreslå'), {
          code: 'invalid_input',
        });
      }
    } else {
      result.content = {
        links: proposal.links.length,
        headings: proposal.headings.length,
        canonicalChanged: proposal.canonicalChanged,
        thumbAltChanged: proposal.thumbAltChanged,
        newCanonical: proposal.newCanonical,
        newThumbAlt: proposal.newThumbAlt,
      };
      result.frozen.contentProposal = proposal;
      if (proposal.links.length) parts.push(`${proposal.links.length} interne links`);
      if (proposal.headings.length) parts.push(`${proposal.headings.length} overskrifter`);
      if (proposal.canonicalChanged) parts.push('canonical');
      if (proposal.thumbAltChanged) parts.push('billede-alt');
    }
  }

  result.summary = parts.length
    ? `Løser: ${parts.join(' · ')}`
    : `Løser: ${kinds.map((k) => k).join(', ')}`;

  storeJobPreview(result);

  const jobWithPreview: ArchiveJob = {
    ...args.job,
    lastPreview: {
      kinds,
      seoTitle: result.seoMeta?.newSeoTitle,
      metaDescription: result.seoMeta?.newMetaDescription,
      summary: result.summary,
    },
    updatedAt: new Date().toISOString(),
  };
  try {
    await saveArchiveJob(jobWithPreview);
  } catch {
    // Preview still valid in-memory if Firestore unavailable in tests
  }

  return result;
}

export async function applyArchiveJob(args: {
  job: ArchiveJob;
  confirmToken: string;
  confirmOverwrite: boolean;
  fetchFn?: typeof fetchArticleItemByLocale;
  patchFn?: typeof patchArticleFieldDataForLocale;
  publishFn?: typeof publishArticleItemForLocale;
}): Promise<{ job: ArchiveJob; written: boolean; error?: string }> {
  if (!args.confirmOverwrite) {
    throw Object.assign(new Error('confirmOverwrite kræves'), { code: 'forbidden' });
  }
  const preview = getJobPreview(args.job.jobId, args.confirmToken);
  if (!preview) {
    throw Object.assign(new Error('Preview udløbet — kør Løs igen'), { code: 'not_found' });
  }

  let job: ArchiveJob = { ...args.job, status: 'fixing' };
  await saveArchiveJob(job).catch(() => undefined);

  const baseFetch = args.fetchFn || fetchArticleItemByLocale;
  const fetchFn = withTransientFetchRetry(baseFetch, { onRetry: () => undefined });
  const patchFn = args.patchFn || patchArticleFieldDataForLocale;
  const publishFn = args.publishFn || publishArticleItemForLocale;
  const { cmsLocaleId, locale, itemId } = preview.frozen;

  const reportDir = ensureSeoEngineBackfillDir({});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  let autoPaused = false;
  let prevAt = true;
  try {
    prevAt = await resolveAutoTranslateEnabled();
    if (prevAt && preview.frozen.contentProposal?.contentChanged) {
      await setAutoTranslateEnabled(false);
      autoPaused = true;
    }
  } catch {
    /* best-effort */
  }

  try {
    const live = await fetchFn(itemId, cmsLocaleId);
    const backup = {
      itemId,
      locale,
      createdAt: new Date().toISOString(),
      createdBy: ARCHIVE_APPLY_SYSTEM_USER,
      snapshot: buildLocaleBackup(live, locale),
      fieldData: live.fieldData,
    };
    const backupPath = join(reportDir, `archive-job-backup-${stamp}-${itemId}.json`);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
    const db = getAdminDb();
    if (db) {
      await db.collection(ARCHIVE_APPLY_BACKUP_COL).add({
        ...backup,
        backupPath,
        fsCreatedAt: FieldValue.serverTimestamp(),
      });
    }

    const slugs = getCmsSeoSlugs();
    const patch: Record<string, unknown> = {};

    if (preview.seoMeta && preview.frozen.newSeoTitle && preview.frozen.newMetaDescription) {
      patch[slugs.seoTitle] = preview.frozen.newSeoTitle;
      patch[slugs.metaDescription] = preview.frozen.newMetaDescription;
    }

    const cp = preview.frozen.contentProposal;
    if (cp) {
      if (cp.contentChanged) patch[fieldSlug('content')] = cp.newContent;
      if (cp.canonicalChanged && cp.newCanonical) {
        patch[fieldSlug('canonical')] = cp.newCanonical;
      }
      if (cp.thumbAltChanged && cp.newThumb) {
        patch[fieldSlug('thumb')] = cp.newThumb;
      }
    }

    if (!Object.keys(patch).length) {
      job = markTasksFailed(job, preview.kinds, 'Ingen felter at skrive');
      await saveArchiveJob(job).catch(() => undefined);
      return { job, written: false, error: job.lastError || undefined };
    }

    await patchFn(itemId, patch, cmsLocaleId);
    if (isWebflowLocalePublished(live)) {
      await publishFn(itemId, cmsLocaleId);
    }

    // Readback for seo_meta
    if (preview.seoMeta) {
      const fresh = await fetchFn(itemId, cmsLocaleId);
      const ok = exactReadbackMatch({
        expectedSeoTitle: preview.frozen.newSeoTitle!,
        expectedMetaDescription: preview.frozen.newMetaDescription!,
        fieldData: fresh.fieldData,
      });
      if (!ok) {
        job = markTasksFailed(job, ['seo_meta'], 'Readback mismatch efter SEO-skrivning');
        await saveArchiveJob(job).catch(() => undefined);
        return { job, written: false, error: job.lastError || undefined };
      }
      job = {
        ...job,
        seoTitle: preview.frozen.newSeoTitle!,
      };
    }

    job = markTasksApplied(job, preview.kinds);

    // Verify planned findings only
    job = await verifyArchiveJobLive({
      job,
      plannedKinds: preview.kinds,
      fetchFn,
    });
    await saveArchiveJob(job).catch(() => undefined);
    previewTokens.delete(tokenKey(args.job.jobId));
    return { job, written: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const friendly = /429|too many|rate.?limit/i.test(msg)
      ? ARCHIVE_APPLY_WEBFLOW_BUSY_DA
      : msg;
    job = markTasksFailed(args.job, preview.kinds, friendly);
    await saveArchiveJob(job).catch(() => undefined);
    return { job, written: false, error: friendly };
  } finally {
    if (autoPaused) {
      try {
        await setAutoTranslateEnabled(prevAt);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Re-fetch CMS and evaluate only planned task kinds. */
export async function verifyArchiveJobLive(args: {
  job: ArchiveJob;
  plannedKinds: ArchiveJobTaskKind[];
  fetchFn?: typeof fetchArticleItemByLocale;
}): Promise<ArchiveJob> {
  const localeIds = resolveWebflowLocaleIds();
  const cmsLocaleId = args.job.locale === 'en' ? localeIds.en : localeIds.dk;
  const fetchFn = args.fetchFn || fetchArticleItemByLocale;
  const live = await fetchFn(args.job.itemId, cmsLocaleId);
  const pair = readCmsSeoPair(live.fieldData);
  const findings = inferFindingsFromLive(live, args.job, pair);

  return applyVerifyToJob(args.job, {
    plannedKinds: args.plannedKinds,
    liveFindings: findings,
    liveSeoTitle: pair.seoTitle || args.job.seoTitle,
  });
}

function inferFindingsFromLive(
  live: WebflowLocaleItem,
  job: ArchiveJob,
  pair: { seoTitle: string | null; metaDescription: string | null }
): Array<{ code: string }> {
  const fd = live.fieldData as Record<string, unknown>;
  const html = String(fd.content || '');
  const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const headingCount = (html.match(/<h[1-6]\b/gi) || []).length;
  const internalLinkCount = (
    html.match(/href=["'][^"']*aproposmagazine\.com\/articles/gi) || []
  ).length;
  const thumb = fd.thumb;
  const hasImageAlt =
    thumb && typeof thumb === 'object'
      ? Boolean(String((thumb as { alt?: string }).alt || '').trim())
      : true;
  const explicitCanonical = Boolean(
    String(fd['canonical-url'] || fd.canonical || '').trim()
  );

  return auditLocaleFields({
    seoTitle: pair.seoTitle || '',
    metaDescription: pair.metaDescription || '',
    language: job.locale,
    articleTypeHint: job.articleTypeHint || '',
    published: isWebflowLocalePublished(live),
    seoTitleCounts: new Map(),
    hasAuthor: true,
    introText: bodyText.slice(0, 280),
    bodyText,
    headingCount,
    internalLinkCount,
    hasImageAlt,
    explicitCanonical,
    ageDays: null,
    freshness: 'unknown',
    siblingLocalePresent: true,
    lastPublished: live.lastPublished ?? null,
  });
}

void createHash;
