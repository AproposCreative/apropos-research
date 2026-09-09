import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  item: { id: 'item', lastUpdated: 'v1', lastPublished: 'published', isDraft: false,
    fieldData: { 'seo-title': '', 'meta-description': '' } } as any,
  enabled: true,
}));
vi.mock('@/lib/seo-engine/opportunity-engine/settings', () => ({ resolveAutoOpportunityOptimizationEnabled: vi.fn(async () => mocks.enabled) }));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({ acquireCmsWriteLease: vi.fn(async () => ({ assertOwned: vi.fn(), release: vi.fn(async () => undefined) })) }));
vi.mock('@/lib/seo-engine/jobs', () => ({
  claimSeoEngineJob: vi.fn(async () => ({ itemId: 'item', jobId: 'job-en', locale: 'en', cmsLastUpdated: 'v1', attempt: 1 })),
  updateSeoEngineJob: vi.fn(), requeueSeoEngineJob: vi.fn(), completeContentClaim: vi.fn(),
  releaseContentClaim: vi.fn(), tryClaimContentHash: vi.fn(async () => 'claimed'),
}));
vi.mock('@/lib/seo-engine/pipeline', () => ({
  analyzeArticle: vi.fn(async () => ({ mode: 'ai', analysisRunId: 'analysis' })),
  strategizeFromRun: vi.fn(async () => ({ mode: 'ai', stale: false, seoVersionId: 'version', validation: { errors: [] } })),
}));
vi.mock('@/lib/seo-engine/store', () => ({ getSeoVersion: vi.fn(async () => ({ pack: { recommended: { fields: {
  seoTitle: { value: 'New title' }, metaDescription: { value: 'New description' },
} } } })) }));
vi.mock('@/lib/seo-engine/cms-contract', () => ({
  cmsSeoEmptiness: (fd: any) => ({ seoTitleEmpty: !fd['seo-title'], metaDescriptionEmpty: !fd['meta-description'], anyEmpty: !fd['seo-title'] || !fd['meta-description'] }),
  webflowItemToSeoEngineInput: () => ({ editorialTitle: 'Title', language: 'en', body: 'Long editorial text '.repeat(30) }),
}));
vi.mock('@/lib/webflow/locale-items', () => ({
  resolveWebflowLocaleIds: () => ({ dk: 'da', en: 'en' }),
  isWebflowLocalePublished: (item: any) => !item.isDraft && !!item.lastPublished,
  fetchArticleItemByLocale: vi.fn(async () => structuredClone(mocks.item)),
  patchArticleFieldDataForLocale: vi.fn(async (_id: string, fields: any) => { Object.assign(mocks.item.fieldData, fields); }),
  publishArticleItemForLocale: vi.fn(),
}));
import { runSeoEngineJob } from '../lib/seo-engine/auto-seo-worker';
import { claimSeoEngineJob, requeueSeoEngineJob } from '../lib/seo-engine/jobs';
import { resolveAutoOpportunityOptimizationEnabled } from '../lib/seo-engine/opportunity-engine/settings';
import { fetchArticleItemByLocale, patchArticleFieldDataForLocale, publishArticleItemForLocale } from '../lib/webflow/locale-items';
beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled = true;
  mocks.item = { id: 'item', lastUpdated: 'v1', lastPublished: 'published', isDraft: false, fieldData: { 'seo-title': '', 'meta-description': '' } };
});
describe('empty-fill worker staged-only contract', () => {
  it('verifies metadata without publishing the item or its staged body', async () => {
    mocks.item.fieldData.body = 'Unpublished editorial changes';
    const result = await runSeoEngineJob('job-en');
    expect(result).toMatchObject({ ok: true, cmsWriteState: 'staged_verified' });
    expect(patchArticleFieldDataForLocale).toHaveBeenCalledWith('item', { 'seo-title': 'New title', 'meta-description': 'New description' }, 'en');
    expect(publishArticleItemForLocale).not.toHaveBeenCalled();
    expect(mocks.item.fieldData.body).toBe('Unpublished editorial changes');
  });
  it('does not consume a queued job while stopped', async () => {
    mocks.enabled = false;
    expect(await runSeoEngineJob('job-en')).toMatchObject({ skipped: true, reason: 'auto_disabled' });
    expect(claimSeoEngineJob).not.toHaveBeenCalled();
  });
  it('requeues without consuming attempts when stopped during generation', async () => {
    vi.mocked(resolveAutoOpportunityOptimizationEnabled).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await runSeoEngineJob('job-en')).toMatchObject({ ok: false, reason: 'auto_disabled' });
    expect(requeueSeoEngineJob).toHaveBeenCalledWith('job-en', 'auto_disabled', { refundAttempt: true });
    expect(patchArticleFieldDataForLocale).not.toHaveBeenCalled();
  });
  it('rejects a draft despite its earlier publication date', async () => {
    mocks.item.isDraft = true;
    expect(await runSeoEngineJob('job-en')).toMatchObject({ skipped: true, reason: 'locale_not_published' });
    expect(patchArticleFieldDataForLocale).not.toHaveBeenCalled();
  });
  it('preserves metadata written by an editor during analysis', async () => {
    vi.mocked(fetchArticleItemByLocale).mockResolvedValueOnce(structuredClone(mocks.item));
    mocks.item.lastUpdated = 'v2'; mocks.item.fieldData['seo-title'] = 'Editor title';
    expect(await runSeoEngineJob('job-en')).toMatchObject({ ok: false, reason: 'stale_fresh_lastUpdated' });
    expect(patchArticleFieldDataForLocale).not.toHaveBeenCalled();
  });
});
