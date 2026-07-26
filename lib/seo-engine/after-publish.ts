import { logger } from '@/lib/logger';
import { cmsSeoEmptiness } from '@/lib/seo-engine/cms-contract';
import { enqueueSeoEngineJob } from '@/lib/seo-engine/enqueue';
import { resolveAutoSeoEngineEnabled } from '@/lib/seo-engine/settings';
import { resolveAutomaticOpportunityRuntime } from '@/lib/seo-engine/opportunity-engine/settings';
import { cmsLocaleIdFor } from '@/lib/seo-engine/opportunity-engine/locale';
import {
  fetchArticleItemByLocale,
  isWebflowLocalePublished,
} from '@/lib/webflow/locale-items';
import type { SeoEngineJob } from '@/lib/seo-engine/jobs';

export type AfterPublishEnqueueResult = {
  enqueued: boolean;
  jobIds?: string[];
  /** @deprecated use jobIds — kept for older callers/tests */
  jobId?: string;
  reason?: string;
  skippedLocales?: Array<{ locale: 'da' | 'en'; reason: string }>;
};

/**
 * Canonical publish-path hook: enqueue auto-SEO for empty SEO fields.
 *
 * Only enqueues for locales that are actually published (not draft/unpublished).
 * DK publish must never write an EN draft's empty metadata.
 * Single durable job path — fail closed, never blocks article publish.
 */
export async function maybeEnqueueSeoEngineAfterPublish(args: {
  itemId: string;
  source?: SeoEngineJob['source'];
  /**
   * Locales to consider. Prefer the locale(s) that were just published
   * (webhook cmsLocaleId / publish flow). Default checks da+en but still
   * requires each locale item to be published before enqueue.
   */
  locales?: Array<'da' | 'en'>;
}): Promise<AfterPublishEnqueueResult> {
  const itemId = String(args.itemId || '').trim();
  if (!itemId) return { enqueued: false, reason: 'missing_item_id' };

  try {
    const [legacyAutoSeo, runtime] = await Promise.all([
      resolveAutoSeoEngineEnabled(),
      resolveAutomaticOpportunityRuntime(),
    ]);

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
    const skippedLocales: Array<{ locale: 'da' | 'en'; reason: string }> = [];
    let anyPublishedEmpty = false;

    for (const locale of locales) {
      const cmsLocaleId = cmsLocaleIdFor(locale);
      try {
        const item = await fetchArticleItemByLocale(itemId, cmsLocaleId);
        if (!isWebflowLocalePublished(item)) {
          skippedLocales.push({ locale, reason: 'locale_not_published' });
          continue;
        }
        const empty = cmsSeoEmptiness(item.fieldData);
        if (!empty.anyEmpty) {
          skippedLocales.push({ locale, reason: 'seo_fields_filled' });
          continue;
        }
        anyPublishedEmpty = true;
        const cmsLastUpdated = item.lastUpdated || item.lastPublished || new Date().toISOString();
        const enq = await enqueueSeoEngineJob({
          itemId,
          cmsLastUpdated,
          source: args.source || 'publish_app',
          locale,
        });
        jobIds.push(enq.jobId);
      } catch (localeErr) {
        skippedLocales.push({
          locale,
          reason: localeErr instanceof Error ? localeErr.message : 'locale_fetch_failed',
        });
        logger.warn('[seo-engine] after-publish locale check failed (non-blocking)', {
          itemId,
          locale,
          message: localeErr instanceof Error ? localeErr.message : String(localeErr),
        });
      }
    }

    if (jobIds.length === 0) {
      return {
        enqueued: false,
        reason: anyPublishedEmpty
          ? 'enqueue_failed'
          : skippedLocales.every((s) => s.reason === 'locale_not_published')
            ? 'no_published_locale'
            : 'seo_fields_filled',
        skippedLocales,
      };
    }
    return { enqueued: true, jobIds, jobId: jobIds[0], skippedLocales };
  } catch (e) {
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
