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

vi.mock('@/lib/seo-engine/enqueue', () => ({
  enqueueSeoEngineJob: vi.fn(async ({ locale }: { locale?: string }) => ({
    jobId: `job-${locale || 'da'}`,
    created: true,
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { maybeEnqueueSeoEngineAfterPublish } from '../lib/seo-engine/after-publish';
import { resolveAutomaticOpportunityRuntime } from '../lib/seo-engine/opportunity-engine/settings';
import { fetchArticleItemByLocale } from '../lib/webflow/locale-items';
import { enqueueSeoEngineJob } from '../lib/seo-engine/enqueue';

describe('after-publish automatic empty SEO fill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues da+en when both locales are published and SEO empty', async () => {
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
      fieldData: { name: 'Title', 'seo-title': '', 'meta-description': '' },
      lastUpdated: '2026-07-01T00:00:00.000Z',
      lastPublished: '2026-07-01T00:00:00.000Z',
      isDraft: false,
    });

    const result = await maybeEnqueueSeoEngineAfterPublish({ itemId: 'item1' });
    expect(result.enqueued).toBe(true);
    expect(result.jobIds).toEqual(['job-da', 'job-en']);
    expect(enqueueSeoEngineJob).toHaveBeenCalledTimes(2);
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
    ).resolves.toMatchObject({ enqueued: false });
  });

  it('skips when emergency stopped', async () => {
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
    expect(enqueueSeoEngineJob).not.toHaveBeenCalled();
  });
});
