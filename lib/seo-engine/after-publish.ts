import { logger } from '@/lib/logger';
import { cmsSeoEmptiness } from '@/lib/seo-engine/cms-contract';
import { enqueueSeoEngineJob } from '@/lib/seo-engine/enqueue';
import { resolveAutoSeoEngineEnabled } from '@/lib/seo-engine/settings';
import { resolveAutomaticOpportunityRuntime } from '@/lib/seo-engine/opportunity-engine/settings';
import { fetchArticleItemByLocale, resolveWebflowLocaleIds } from '@/lib/webflow/locale-items';

/**
 * Canonical publish-path hook: enqueue auto-SEO for empty DK SEO fields.
 *
 * Production default: runs when opportunity auto-drift is enabled (default ON)
 * OR legacy Auto-SEO flag is on — and Webflow is available.
 * Fail closed: never throws / never blocks article publish.
 */
export async function maybeEnqueueSeoEngineAfterPublish(args: {
  itemId: string;
  source?: 'publish_app' | 'manual';
}): Promise<{ enqueued: boolean; jobId?: string; reason?: string }> {
  const itemId = String(args.itemId || '').trim();
  if (!itemId) return { enqueued: false, reason: 'missing_item_id' };

  try {
    const [legacyAutoSeo, runtime] = await Promise.all([
      resolveAutoSeoEngineEnabled(),
      resolveAutomaticOpportunityRuntime(),
    ]);

    // Automatic empty-fill when opportunity auto is on (production default) or legacy Auto-SEO.
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

    const { dk } = resolveWebflowLocaleIds();
    const item = await fetchArticleItemByLocale(itemId, dk);
    const empty = cmsSeoEmptiness(item.fieldData);
    if (!empty.anyEmpty) {
      return { enqueued: false, reason: 'seo_fields_filled' };
    }
    const cmsLastUpdated = item.lastUpdated || item.lastPublished || new Date().toISOString();
    const enq = await enqueueSeoEngineJob({
      itemId,
      cmsLastUpdated,
      source: args.source || 'publish_app',
    });
    return { enqueued: true, jobId: enq.jobId };
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
