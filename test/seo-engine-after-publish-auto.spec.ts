vi.mock('@/lib/seo-engine/post-publish/dispatch', () => ({ kickQualityJob: vi.fn() }));
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/seo-engine/settings', () => ({
  resolveAutoSeoEngineEnabled: vi.fn(async () => false),
}));

vi.mock('@/lib/seo-engine/opportunity-engine/settings', () => ({
  resolveAutomaticOpportunityRuntime: vi.fn(),
}));

vi.mock('@/lib/webflow/locale-items', () => ({
  resolveWebflowLocaleIds: () => ({ dk: 'dk-locale', en: 'en-locale' }),
  fetchArticleItemByLocale: vi.fn(),
  isWebflowLocalePublished: (item: { isDraft?: boolean; lastPublished?: string | null }) => {
    if (item.isDraft === true) return false;
    return Boolean(item.lastPublished?.trim());
  },
}));

vi.mock('@/lib/seo-engine/post-publish/runtime', () => ({
  enqueuePublishedQualityReview: vi.fn(async (_itemId: string, locale: string) => ({
    jobId: `job-${locale || 'da'}`,
    enqueued: true,
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { resolveAutoSeoEngineEnabled } from '../lib/seo-engine/settings';
import { maybeEnqueueSeoEngineAfterPublish } from '../lib/seo-engine/after-publish';
import { resolveAutomaticOpportunityRuntime } from '../lib/seo-engine/opportunity-engine/settings';
import { fetchArticleItemByLocale } from '../lib/webflow/locale-items';
import { enqueuePublishedQualityReview } from '../lib/seo-engine/post-publish/runtime';

describe('after-publish automatic metadata quality review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['', 'Allerede udfyldt SEO'])('enqueues da+en for published metadata: %s', async existing => {
    vi.mocked(resolveAutomaticOpportunityRuntime).mockResolvedValue({
      killSwitchEnabled: true,
      connectionsHealthyForOptimize: true,
      canAutoFillOnPublish: true,
      shouldAutoOptimize: true,
      shouldAutoFillOnPublish: true,
      connectionSummary: 'ok',
    });
    vi.mocked(fetchArticleItemByLocale).mockResolvedValue({
      id: 'item1',
      fieldData: { name: 'Title', 'seo-title': existing, 'meta-description': existing },
      lastUpdated: '2026-07-01T00:00:00.000Z',
      lastPublished: '2026-07-01T00:00:00.000Z',
      isDraft: false,
    });

    const result = await maybeEnqueueSeoEngineAfterPublish({ itemId: 'item1' });
    expect(result.enqueued).toBe(true);
    expect(result.jobIds).toEqual(['job-da', 'job-en']);
    expect(enqueuePublishedQualityReview).toHaveBeenCalledTimes(2);
  });

  it('fail-closed: never throws when enqueue fails', async () => {
    vi.mocked(resolveAutomaticOpportunityRuntime).mockResolvedValue({
      killSwitchEnabled: true,
      connectionsHealthyForOptimize: true,
      canAutoFillOnPublish: true,
      shouldAutoOptimize: true,
      shouldAutoFillOnPublish: true,
      connectionSummary: 'ok',
    });
    vi.mocked(fetchArticleItemByLocale).mockRejectedValue(new Error('webflow down'));

    await expect(
      maybeEnqueueSeoEngineAfterPublish({ itemId: 'item1' })
    ).resolves.toMatchObject({ enqueued: false, needsRetry: true });
  });

  it('reports a failed locale even when its sibling was queued successfully', async () => {
    vi.mocked(resolveAutomaticOpportunityRuntime).mockResolvedValue({ killSwitchEnabled: true,
      connectionsHealthyForOptimize: true, canAutoFillOnPublish: true, shouldAutoOptimize: true,
      shouldAutoFillOnPublish: true, connectionSummary: 'ok' });
    vi.mocked(fetchArticleItemByLocale).mockResolvedValueOnce({ id: 'item1', fieldData: {}, lastPublished: '2026-09-12' })
      .mockRejectedValueOnce(new Error('EN read failed'));
    expect(await maybeEnqueueSeoEngineAfterPublish({ itemId: 'item1' })).toMatchObject({
      enqueued: true, jobIds: ['job-da'], needsRetry: true,
    });
  });

  it('skips when emergency stopped even if legacy empty-fill is enabled', async () => {
    vi.mocked(resolveAutoSeoEngineEnabled).mockResolvedValueOnce(true);
    vi.mocked(resolveAutomaticOpportunityRuntime).mockResolvedValue({
      killSwitchEnabled: false,
      connectionsHealthyForOptimize: true,
      canAutoFillOnPublish: false,
      shouldAutoOptimize: false,
      shouldAutoFillOnPublish: false,
      connectionSummary: 'stopped',
    });

    const result = await maybeEnqueueSeoEngineAfterPublish({ itemId: 'item1' });
    expect(result.enqueued).toBe(false);
    expect(result.reason).toMatch(/emergency_stopped|auto_fill/);
    expect(enqueuePublishedQualityReview).not.toHaveBeenCalled();
  });
});
