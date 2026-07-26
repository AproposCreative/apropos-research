import { logger } from '@/lib/logger';
import { cmsSeoEmptiness } from '@/lib/seo-engine/cms-contract';
import { enqueueSeoEngineJob } from '@/lib/seo-engine/enqueue';
import { resolveAutoSeoEngineEnabled } from '@/lib/seo-engine/settings';
import { resolveAutomaticOpportunityRuntime } from '@/lib/seo-engine/opportunity-engine/settings';
import { cmsLocaleIdFor } from '@/lib/seo-engine/opportunity-engine/locale';
import { fetchArticleItemByLocale } from '@/lib/webflow/locale-items';
import type { SeoEngineJob } from '@/lib/seo-engine/jobs';

export type AfterPublishEnqueueResult = {
  enqueued: boolean;
  jobIds?: string[];
  /** @deprecated use jobIds — kept for older callers/tests */
  jobId?: string;
  reason?: string;
};

/**
 * Canonical publish-path hook: enqueue auto-SEO for empty SEO fields (da + en).
 *
 * Single write path via durable job queue (same as webhook) — no double CMS writes.
 * Never touches original publish date / editorial fields.
 * Fail closed: never throws / never blocks article publish.
 */
export async function maybeEnqueueSeoEngineAfterPublish(args: {
  itemId: string;
  source?: SeoEngineJob['source'];
  /** When set, only check this locale; otherwise both da+en. */
  locales?: Array<'da' | 'en'>;
}): Promise<AfterPublishEnqueueResult> {
  const itemId = String(args.itemId || '').trim();
  if (!itemId) return { enqueued: false, reason: 'missing_item_id' };

  try {
    const [legacyAutoSeo, runtime] = await Promise.all([
      resolveAutoSeoEngineEnabled(),
      resolveAutomaticOpportunityRuntime(),
    ]);

    // One gate: opportunity auto-fill (default) OR legacy Auto-SEO — still a single enqueue path.
    const allow = runtime.shouldAutoFillOnPublish || legacyAutoSeo;
    if (!allow) {
      return {
        enqueued: false,
        reason: !runtime.killSwitchEnabled
          ? 'auto_optimization_emergency_stopped'
          : legacyAutoSeo
            ? 'webflow_unhealthy'
            : 'auto_fill_unavailable',
      };
    }

    const locales: Array<'da' | 'en'> = args.locales?.length
      ? [...args.locales]
      : ['da', 'en'];
    const jobIds: string[] = [];
    let anyEmpty = false;

    for (const locale of locales) {
      const cmsLocaleId = cmsLocaleIdFor(locale);
      try {
        const item = await fetchArticleItemByLocale(itemId, cmsLocaleId);
        const empty = cmsSeoEmptiness(item.fieldData);
        if (!empty.anyEmpty) continue;
        anyEmpty = true;
        // Prefer lastUpdated for stale detection; never rewrite publish date in worker.
        const cmsLastUpdated = item.lastUpdated || item.lastPublished || new Date().toISOString();
        const enq = await enqueueSeoEngineJob({
          itemId,
          cmsLastUpdated,
          source: args.source || 'publish_app',
          locale,
        });
        jobIds.push(enq.jobId);
      } catch (localeErr) {
        logger.warn('[seo-engine] after-publish locale check failed (non-blocking)', {
          itemId,
          locale,
          message: localeErr instanceof Error ? localeErr.message : String(localeErr),
        });
      }
    }

    if (!anyEmpty) {
      return { enqueued: false, reason: 'seo_fields_filled' };
    }
    if (jobIds.length === 0) {
      return { enqueued: false, reason: 'enqueue_failed' };
    }
    return { enqueued: true, jobIds, jobId: jobIds[0] };
  } catch (e) {
    // Fail closed — publish must succeed even if SEO enqueue fails.
    logger.warn('[seo-engine] after-publish enqueue failed (non-blocking)', {
      itemId,
      message: e instanceof Error ? e.message : String(e),
    });
    return {
      enqueued: false,
      reason: e instanceof Error ? e.message : 'enqueue_failed',
    };
  }
}
