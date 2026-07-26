/**
 * Pure webhook decision helpers — unit-tested without Next/Webflow.
 */

export type WebhookFeatureFlags = {
  imageOptOn: boolean;
  autoSeoOn: boolean;
  autoTranslateOn: boolean;
  isPrimaryLocale: boolean;
  triggerType: string;
};

export function shouldRunImageOptimize(flags: WebhookFeatureFlags): boolean {
  return flags.imageOptOn;
}

export function shouldEnqueueTranslation(flags: WebhookFeatureFlags): boolean {
  return (
    flags.triggerType === 'collection_item_published' &&
    flags.autoTranslateOn &&
    flags.isPrimaryLocale
  );
}

export function shouldAttemptSeoEnqueue(flags: WebhookFeatureFlags): boolean {
  // Locale-agnostic: after-publish checks da+en and dedupes jobs.
  // isPrimaryLocale no longer required (EN publishes must also fill empty SEO).
  return flags.triggerType === 'collection_item_published' && flags.autoSeoOn;
}

/**
 * Any durable SEO enqueue failure among attempted items => needsRetry / 503.
 * Success on other items must NOT mask a failure.
 */
export function resolveWebhookSeoHttpStatus(args: {
  autoSeoOn: boolean;
  seoEngineErrors: Array<{ itemId: string; error: string }>;
  seoEngineQueued: string[];
}): { status: 200 | 503; ok: boolean; needsRetry: boolean } {
  if (!args.autoSeoOn) {
    return { status: 200, ok: true, needsRetry: false };
  }
  const failed = args.seoEngineErrors.length > 0;
  if (failed) {
    return { status: 503, ok: false, needsRetry: true };
  }
  return { status: 200, ok: true, needsRetry: false };
}
