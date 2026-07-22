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
  publishArticleItemForLocale,
  resolveWebflowLocaleIds,
} from '@/lib/webflow/locale-items';

export type CmsItemSnapshot = {
  id: string;
  fieldData: Record<string, unknown>;
  lastUpdated: string;
  lastPublished?: string | null;
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

async function fetchCmsItemFull(itemId: string): Promise<CmsItemSnapshot> {
  const { getWebflowConfig } = await import('@/lib/webflow-config');
  const { env } = await import('@/lib/config/env');
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || '';
  const collectionId =
    (file.articlesCollectionId !== undefined
      ? file.articlesCollectionId
      : env.WEBFLOW_ARTICLES_COLLECTION_ID) || '';
  const { dk } = resolveWebflowLocaleIds();
  const qs = new URLSearchParams({ cmsLocaleId: dk });
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}?${qs}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow fetch ${res.status}`);
  }
  const item = (await res.json()) as {
    id?: string;
    fieldData?: Record<string, unknown>;
    lastUpdated?: string;
    lastPublished?: string | null;
  };
  return {
    id: String(item.id || itemId),
    fieldData: (item.fieldData || {}) as Record<string, unknown>,
    lastUpdated: String(item.lastUpdated || ''),
    lastPublished: item.lastPublished ?? null,
  };
}

/**
 * Process one durable SEO Engine job: analyze → strategize → empty-only PATCH (DK locale).
 */
export async function runSeoEngineJob(jobId: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  seoVersionId?: string;
}> {
  const claimed = await claimSeoEngineJob(jobId);
  if (!claimed) {
    return { ok: true, skipped: true, reason: 'Job ikke claimet (allerede done/busy)' };
  }

  let contentHash: string | null = null;
  let contentClaimed = false;

  try {
    const item = await fetchCmsItemFull(claimed.itemId);
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
    const input = webflowItemToSeoEngineInput({ fieldData: item.fieldData });
    const inputVersionHash = computeInputVersionHash(input);
    contentHash = inputVersionHash;
    await updateSeoEngineJob(jobId, { inputVersionHash });

    const claim = await tryClaimContentHash(claimed.itemId, inputVersionHash);
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
      articleKey: `wf:${claimed.itemId}`,
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
      await completeContentClaim(claimed.itemId, inputVersionHash, 'stale');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, {
        status: 'stale',
        seoVersionId: strategy.seoVersionId,
      });
      return { ok: false, reason: 'stale_after_strategy' };
    }

    const fresh = await fetchCmsItemFull(claimed.itemId);
    if (
      isFreshFetchStaleVsAnalyzed({
        analyzedLastUpdated,
        freshLastUpdated: fresh.lastUpdated,
      })
    ) {
      await completeContentClaim(claimed.itemId, inputVersionHash, 'stale');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, {
        status: 'stale',
        skipReason: 'fresh_lastUpdated_changed',
        seoVersionId: strategy.seoVersionId,
      });
      return { ok: false, reason: 'stale_fresh_lastUpdated', seoVersionId: strategy.seoVersionId };
    }

    const freshEmpty = cmsSeoEmptiness(fresh.fieldData);
    if (!freshEmpty.anyEmpty) {
      await completeContentClaim(claimed.itemId, inputVersionHash, 'skipped');
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
      await completeContentClaim(claimed.itemId, inputVersionHash, 'skipped');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, { status: 'skipped', skipReason: 'empty_patch' });
      return { ok: true, skipped: true, reason: 'Intet at patche' };
    }

    if ((strategy.validation.errors || []).length > 0) {
      await completeContentClaim(claimed.itemId, inputVersionHash, 'failed');
      contentClaimed = false;
      await updateSeoEngineJob(jobId, {
        status: 'failed',
        lastError: 'validator_errors',
        seoVersionId: strategy.seoVersionId,
      });
      return { ok: false, reason: 'validator_errors', seoVersionId: strategy.seoVersionId };
    }

    const { dk } = resolveWebflowLocaleIds();
    await patchArticleFieldDataForLocale(claimed.itemId, cmsPatch, dk);

    const verified = await fetchCmsItemFull(claimed.itemId);
    const slugs = getCmsSeoSlugs();
    for (const [domainKey, cmsSlug] of [
      ['seoTitle', slugs.seoTitle],
      ['metaDescription', slugs.metaDescription],
    ] as const) {
      if (domainKey in patchDomain) {
        const val = verified.fieldData[cmsSlug];
        if (isCmsSeoFieldEmpty(val)) {
          throw new Error(`Post-write verify failed for ${cmsSlug}`);
        }
      }
    }

    if (fresh.lastPublished) {
      await publishArticleItemForLocale(claimed.itemId, dk);
    }

    await completeContentClaim(claimed.itemId, inputVersionHash, 'succeeded');
    contentClaimed = false;
    await updateSeoEngineJob(jobId, {
      status: 'succeeded',
      seoVersionId: strategy.seoVersionId,
      inputVersionHash,
    });

    logger.info('[seo-engine] auto-seo succeeded', {
      itemId: claimed.itemId,
      jobId,
      patched: Object.keys(cmsPatch),
    });

    return { ok: true, seoVersionId: strategy.seoVersionId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      '[seo-engine] job failed',
      e instanceof Error ? e : new Error(message),
      { jobId }
    );

    if (contentClaimed && contentHash) {
      try {
        await releaseContentClaim(claimed.itemId, contentHash);
      } catch {
        /* ignore */
      }
    }

    const attempt = claimed.attempt || 1;
    const terminal = attempt >= (claimed.maxAttempts || 3);
    await updateSeoEngineJob(jobId, {
      status: terminal ? 'failed' : 'queued',
      lastError: message.slice(0, 500),
    });
    return { ok: false, reason: message };
  }
}

/** Re-export emptiness helper for tests */
export { cmsSeoEmptiness, getCmsSeoSlugs, isCmsSeoFieldEmpty };
export type { SeoEngineJob };
