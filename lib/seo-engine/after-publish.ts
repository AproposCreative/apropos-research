import { logger } from '@/lib/logger';
import { cmsSeoEmptiness } from '@/lib/seo-engine/cms-contract';
import { enqueueSeoEngineJob } from '@/lib/seo-engine/enqueue';
import { resolveAutoSeoEngineEnabled } from '@/lib/seo-engine/settings';
import { fetchArticleItemByLocale, resolveWebflowLocaleIds } from '@/lib/webflow/locale-items';

/**
 * Canonical publish-path hook: enqueue auto-SEO for empty DK SEO fields.
 * Same idempotency / empty-only rules as webhook (durable job write only).
 */
export async function maybeEnqueueSeoEngineAfterPublish(args: {
  itemId: string;
  source?: 'publish_app' | 'manual';
}): Promise<{ enqueued: boolean; jobId?: string; reason?: string }> {
  const itemId = String(args.itemId || '').trim();
  if (!itemId) return { enqueued: false, reason: 'missing_item_id' };

  if (!(await resolveAutoSeoEngineEnabled())) {
    return { enqueued: false, reason: 'auto_seo_off' };
  }

  try {
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
    logger.warn('[seo-engine] after-publish enqueue failed', {
      itemId,
      message: e instanceof Error ? e.message : String(e),
    });
    return {
      enqueued: false,
      reason: e instanceof Error ? e.message : 'enqueue_failed',
    };
  }
}
