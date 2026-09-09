import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { resolveAutoOpportunityOptimizationEnabled } from '@/lib/seo-engine/opportunity-engine/settings';
import { logger } from '@/lib/logger';
import { computeInputVersionHash } from '@/lib/seo-engine/hash';
import { cmsSeoEmptiness, webflowItemToSeoEngineInput } from '@/lib/seo-engine/cms-contract';
import {
  claimSeoEngineJob,
  completeContentClaim,
  releaseContentClaim,
  requeueSeoEngineJob,
  tryClaimContentHash,
  updateSeoEngineJob,
  type SeoEngineJob,
} from '@/lib/seo-engine/jobs';
import { analyzeArticle, strategizeFromRun } from '@/lib/seo-engine/pipeline';
import { toWebflowSeoPatch, getCmsSeoSlugs, isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
import { getSeoVersion } from '@/lib/seo-engine/store';
import {
  patchArticleFieldDataForLocale,
  fetchArticleItemByLocale,
  isWebflowLocalePublished,
  resolveWebflowLocaleIds,
} from '@/lib/webflow/locale-items';

export type CmsItemSnapshot = {
  id: string;
  fieldData: Record<string, unknown>;
  lastUpdated: string;
  lastPublished?: string | null;
  isDraft?: boolean;
};

/** Pure decision helpers for worker tests. */
export function shouldSkipBothSeoFilled(fieldData: Record<string, unknown>): boolean {
  return !cmsSeoEmptiness(fieldData).anyEmpty;
}

export function isCmsContentStale(args: {
  claimedCmsLastUpdated: string;
  itemLastUpdated: string;
}): boolean {
  if (!args.claimedCmsLastUpdated || args.claimedCmsLastUpdated === 'unknown') return false;
  if (!args.itemLastUpdated) return false;
  return args.claimedCmsLastUpdated !== args.itemLastUpdated;
}

/** After Fase B: if CMS lastUpdated changed vs the item we analyzed, block write. */
export function isFreshFetchStaleVsAnalyzed(args: {
  analyzedLastUpdated: string;
  freshLastUpdated: string;
}): boolean {
  if (!args.analyzedLastUpdated || !args.freshLastUpdated) return false;
  return args.analyzedLastUpdated !== args.freshLastUpdated;
}

export function assertWorkerMayPublishStrategy(args: {
  mode: 'ai' | 'demo';
  nodeEnv?: string;
  seoEngineDemo?: string;
}): void {
  if (args.mode === 'demo') {
    throw Object.assign(new Error('Auto-worker må ikke publicere demo-strategi til CMS'), {
      code: 'demo_blocked',
    });
  }
  if ((args.nodeEnv || process.env.NODE_ENV) === 'production' && (args.seoEngineDemo || process.env.SEO_ENGINE_DEMO) === 'true') {
    throw Object.assign(new Error('SEO_ENGINE_DEMO må ikke styre auto-worker i production'), {
      code: 'demo_blocked',
    });
  }
}

export function buildEmptyOnlyDomainPatch(args: {
  seoTitleEmpty: boolean;
  metaDescriptionEmpty: boolean;
  seoTitle: string;
  metaDescription: string;
}): { seoTitle?: string; metaDescription?: string } {
  const patch: { seoTitle?: string; metaDescription?: string } = {};
  if (args.seoTitleEmpty) patch.seoTitle = args.seoTitle;
  if (args.metaDescriptionEmpty) patch.metaDescription = args.metaDescription;
  return patch;
}

async function fetchCmsItemFull(
  itemId: string,
  locale: 'da' | 'en' = 'da'
): Promise<CmsItemSnapshot> {
  const { dk, en } = resolveWebflowLocaleIds();
  const item = await fetchArticleItemByLocale(itemId, locale === 'en' ? en : dk);
  return { ...item, lastUpdated: item.lastUpdated || '' };
}

/**
 * Process one durable SEO Engine job: analyze → strategize → empty-only PATCH.
 * Respects job.locale (da|en). Never rewrites original publish date — only empty SEO fields.
 */
export async function runSeoEngineJob(jobId: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  seoVersionId?: string;
  cmsWriteState?: 'staged_verified';
}> {
  if (!(await resolveAutoOpportunityOptimizationEnabled())) {
    return { ok: true, skipped: true, reason: 'auto_disabled' };
  }
  const claimed = await claimSeoEngineJob(jobId);
  if (!claimed) {
    return { ok: true, skipped: true, reason: 'Job ikke claimet (allerede done/busy)' };
  }

  const locale: 'da' | 'en' = claimed.locale === 'en' ? 'en' : 'da';
  const claimKey = `${claimed.itemId}:${locale}`;
  let contentHash: string | null = null;
  let contentClaimed = false;
  let lease: Awaited<ReturnType<typeof acquireCmsWriteLease>> | undefined;

  try {
    const item = await fetchCmsItemFull(claimed.itemId, locale);
    if (!isWebflowLocalePublished(item)) {
      await updateSeoEngineJob(jobId, { status: 'skipped', skipReason: 'locale_not_published' });
      return { ok: true, skipped: true, reason: 'locale_not_published' };
    }
    if (shouldSkipBothSeoFilled(item.fieldData)) {
      await updateSeoEngineJob(jobId, {
        status: 'skipped',
        skipReason: 'seo_fields_filled',
      });
      return { ok: true, skipped: true, reason: 'SEO-felter allerede udfyldt' };
    }

    if (
      isCmsContentStale({
        claimedCmsLastUpdated: claimed.cmsLastUpdated,
        itemLastUpdated: item.lastUpdated,
      })
    ) {
      await updateSeoEngineJob(jobId, {
        status: 'stale',
        skipReason: 'cms_lastUpdated_mismatch',
      });
      return { ok: true, skipped: true, reason: 'CMS ændret siden enqueue (stale)' };
    }

    const analyzedLastUpdated = item.lastUpdated;
    // Preserve original publish date as input only — never written back to CMS.
    const input = webflowItemToSeoEngineInput({
      fieldData: item.fieldData,
      publishDate: item.lastPublished || undefined,
      dateModified: item.lastUpdated || undefined,
      language: locale,
    });
    const inputVersionHash = computeInputVersionHash(input);
    contentHash = inputVersionHash;
    await updateSeoEngineJob(jobId, { inputVersionHash });

    // Locale-scoped content claim so da/en do not block each other.
    const claim = await tryClaimContentHash(claimKey, inputVersionHash);
    if (claim === 'done') {
      await updateSeoEngineJob(jobId, {
        status: 'skipped',
        skipReason: 'content_hash_done',
        inputVersionHash,
      });
      return { ok: true, skipped: true, reason: 'Samme indhold allerede behandlet' };
    }
    if (claim === 'busy') {
      await requeueSeoEngineJob(jobId, 'content_hash_busy', { refundAttempt: true });
      return { ok: false, reason: 'content_hash_busy_requeued' };
    }
    contentClaimed = true;

    // Never force demo in auto-worker — even if SEO_ENGINE_DEMO is accidentally set
    const analysis = await analyzeArticle(input, {
      userId: 'system:seo-engine-worker',
      forceDemo: false,
      webflowItemId: claimed.itemId,
      articleKey: `wf:${claimed.itemId}:${locale}`,
    });
    if (analysis.mode === 'demo') {
      throw Object.assign(new Error('Worker modtog demo-analyse — afviser CMS-write'), {
        code: 'demo_blocked',
      });
    }

    const strategy = await strategizeFromRun(analysis.analysisRunId, {
      userId: 'system:seo-engine-worker',
      currentInput: input,
      forceDemo: false,
    });
    assertWorkerMayPublishStrategy({ mode: strategy.mode });

    if (strategy.stale) {
      await completeContentClaim(claimKey, inputVersionHash, 'stale');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, {
        status: 'stale',
        seoVersionId: strategy.seoVersionId,
      });
      return { ok: false, reason: 'stale_after_strategy' };
    }

    lease = await acquireCmsWriteLease(claimed.itemId, locale);
    const fresh = await fetchCmsItemFull(claimed.itemId, locale);
    if (
      isFreshFetchStaleVsAnalyzed({
        analyzedLastUpdated,
        freshLastUpdated: fresh.lastUpdated,
      })
    ) {
      await completeContentClaim(claimKey, inputVersionHash, 'stale');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, {
        status: 'stale',
        skipReason: 'fresh_lastUpdated_changed',
        seoVersionId: strategy.seoVersionId,
      });
      return { ok: false, reason: 'stale_fresh_lastUpdated', seoVersionId: strategy.seoVersionId };
    }

    if (!isWebflowLocalePublished(fresh)) {
      throw Object.assign(new Error('Artiklen er nu kladde'), { code: 'revision_conflict' });
    }
    const freshEmpty = cmsSeoEmptiness(fresh.fieldData);
    if (!freshEmpty.anyEmpty) {
      await completeContentClaim(claimKey, inputVersionHash, 'skipped');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, {
        status: 'skipped',
        skipReason: 'filled_on_refetch',
        seoVersionId: strategy.seoVersionId,
      });
      return { ok: true, skipped: true, reason: 'Felter udfyldt ved re-fetch' };
    }

    const version = await getSeoVersion(strategy.seoVersionId);
    const fields = version?.pack.recommended.fields;
    if (!fields) {
      throw new Error('Manglende strategy fields');
    }

    const patchDomain = buildEmptyOnlyDomainPatch({
      seoTitleEmpty: freshEmpty.seoTitleEmpty,
      metaDescriptionEmpty: freshEmpty.metaDescriptionEmpty,
      seoTitle: fields.seoTitle.value,
      metaDescription: fields.metaDescription.value,
    });

    const cmsPatch = toWebflowSeoPatch(patchDomain);
    if (Object.keys(cmsPatch).length === 0) {
      await completeContentClaim(claimKey, inputVersionHash, 'skipped');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, { status: 'skipped', skipReason: 'empty_patch' });
      return { ok: true, skipped: true, reason: 'Intet at patche' };
    }

    if ((strategy.validation.errors || []).length > 0) {
      await completeContentClaim(claimKey, inputVersionHash, 'failed');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, {
        status: 'failed',
        lastError: 'validator_errors',
        seoVersionId: strategy.seoVersionId,
      });
      return { ok: false, reason: 'validator_errors', seoVersionId: strategy.seoVersionId };
    }

    const { dk, en } = resolveWebflowLocaleIds();
    const cmsLocaleId = locale === 'en' ? en : dk;
    const beforeWrite = await fetchCmsItemFull(claimed.itemId, locale);
    if (!isWebflowLocalePublished(beforeWrite) || beforeWrite.lastUpdated !== fresh.lastUpdated ||
        JSON.stringify(beforeWrite.fieldData) !== JSON.stringify(fresh.fieldData)) {
      throw Object.assign(new Error('CMS ændret før skrivning'), { code: 'revision_conflict' });
    }
    if (!(await resolveAutoOpportunityOptimizationEnabled())) {
      throw Object.assign(new Error('Automatisk SEO er stoppet'), { code: 'auto_disabled' });
    }
    await lease.assertOwned();
    await patchArticleFieldDataForLocale(claimed.itemId, cmsPatch, cmsLocaleId);

    const verified = await fetchCmsItemFull(claimed.itemId, locale);
    const slugs = getCmsSeoSlugs();
    for (const [domainKey, cmsSlug] of [
      ['seoTitle', slugs.seoTitle],
      ['metaDescription', slugs.metaDescription],
    ] as const) {
      if (domainKey in patchDomain) {
        const val = verified.fieldData[cmsSlug];
        const expected = String(patchDomain[domainKey] || '').trim();
        const live = isCmsSeoFieldEmpty(val) ? '' : String(val).trim();
        if (!live || live !== expected) {
          throw new Error(
            `Post-write exact readback failed for ${cmsSlug}: expected exact strategy value`
          );
        }
      }
    }

    // Staged metadata only. Publishing an item could release unrelated editorial drafts.
    await completeContentClaim(claimKey, inputVersionHash, 'succeeded');
    contentClaimed = false;
    await updateSeoEngineJob(jobId, {
      status: 'succeeded',
      cmsWriteState: 'staged_verified',
      cmsVerifiedAt: new Date().toISOString(),
      seoVersionId: strategy.seoVersionId,
      inputVersionHash,
    });

    logger.info('[seo-engine] auto-seo succeeded', {
      itemId: claimed.itemId,
      jobId,
      locale,
      patched: Object.keys(cmsPatch),
    });

    return { ok: true, seoVersionId: strategy.seoVersionId, cmsWriteState: 'staged_verified' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      '[seo-engine] job failed',
      e instanceof Error ? e : new Error(message),
      { jobId }
    );

    if (contentClaimed && contentHash) {
      try {
        await releaseContentClaim(claimKey, contentHash);
      } catch {
        /* ignore */
      }
    }

    const code = (e as { code?: string }).code;
    if (code === 'auto_disabled' || code === 'write_busy') {
      await requeueSeoEngineJob(jobId, code, { refundAttempt: true });
      return { ok: false, reason: code };
    }
    const attempt = claimed.attempt || 1;
    const terminal = attempt >= (claimed.maxAttempts || 3);
    await updateSeoEngineJob(jobId, {
      status: terminal ? 'failed' : 'queued',
      lastError: message.slice(0, 500),
    });
    return { ok: false, reason: message };
  } finally {
    await lease?.release().catch(() => undefined);
  }
}

/** Re-export emptiness helper for tests */
export { cmsSeoEmptiness, getCmsSeoSlugs, isCmsSeoFieldEmpty };
export type { SeoEngineJob };
