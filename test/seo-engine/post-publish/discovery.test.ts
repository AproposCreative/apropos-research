import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ state: {} as Record<string, unknown>, page: vi.fn(), enqueue: vi.fn(), enabled: true }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => 'cursor' }),
  runTransaction: async (fn: (tx: unknown) => unknown) => fn({
    get: async () => ({ data: () => ({ ...m.state }) }),
    set: (_ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => { m.state = options?.merge ? { ...m.state, ...data } : data; },
    update: (_ref: unknown, data: Record<string, unknown>) => { m.state = { ...m.state, ...data }; },
  }),
}) }));
vi.mock('@/lib/seo-engine/opportunity-engine/settings', () => ({ resolveAutoOpportunityOptimizationEnabled: async () => m.enabled }));
vi.mock('@/lib/seo-engine/opportunity-engine/locale', () => ({ cmsLocaleIdFor: (locale: string) => `${locale}-id` }));
vi.mock('@/lib/seo-engine/webflow-adapter', () => ({ getCmsSeoSlugs: () => ({ seoTitle: 'seo-title', metaDescription: 'meta-description' }) }));
vi.mock('@/lib/seo-engine/post-publish/cms', () => ({ listPublishedArticlePage: m.page }));
vi.mock('@/lib/seo-engine/post-publish/jobs', () => ({ enqueueQualityJob: m.enqueue }));
import { discoverPublishedQualityJobs, nextDiscoveryCursor } from '../../../lib/seo-engine/post-publish/discovery';

const item = { id: 'item', cmsLocaleId: 'da-id', lastPublished: '2026-09-12', fieldData: {
  name: 'Mayday', content: '<p>Article</p>', 'seo-title': 'Filled title', 'meta-description': 'Filled description',
} };
describe('published article discovery', () => {
  beforeEach(() => { m.state = {}; m.page.mockReset(); m.enqueue.mockReset(); m.enabled = true; m.enqueue.mockResolvedValue({ enqueued: true, jobId: 'job' }); });
  it('cycles over complete DA and EN pages rather than only GSC candidates', () => {
    expect(nextDiscoveryCursor({ locale: 'da', offset: 0 }, 50, 125)).toEqual({ locale: 'da', offset: 50 });
    expect(nextDiscoveryCursor({ locale: 'da', offset: 100 }, 25, 125)).toEqual({ locale: 'en', offset: 0 });
    expect(nextDiscoveryCursor({ locale: 'en', offset: 0 }, 0, 0)).toEqual({ locale: 'da', offset: 0 });
  });
  it('queues filled metadata and advances only after durable enqueue', async () => {
    m.page.mockResolvedValue({ items: [item], total: 1 });
    const result = await discoverPublishedQualityJobs();
    expect(result).toMatchObject({ inspected: 1, next: { locale: 'en', offset: 0 } });
    expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({ source: 'recovery',
      snapshot: expect.objectContaining({ metadata: { seoTitle: 'Filled title', metaDescription: 'Filled description' } }) }));
  });
  it('does not lose the cursor on a partial enqueue failure', async () => {
    m.state = { locale: 'da', offset: 50 };
    m.page.mockResolvedValue({ items: [item], total: 100 });
    m.enqueue.mockRejectedValue(new Error('Firestore unavailable'));
    await expect(discoverPublishedQualityJobs()).rejects.toThrow('Firestore unavailable');
    expect(m.state).toMatchObject({ locale: 'da', offset: 50, leaseUntil: 0 });
  });
  it('does no discovery work while stopped or already leased', async () => {
    m.enabled = false;
    expect(await discoverPublishedQualityJobs()).toMatchObject({ skipped: true, reason: 'auto_disabled' });
    m.enabled = true;
    m.state = { leaseUntil: Date.now() + 60_000 };
    expect(await discoverPublishedQualityJobs()).toMatchObject({ skipped: true, reason: 'discovery_busy' });
    expect(m.page).not.toHaveBeenCalled();
  });
});
