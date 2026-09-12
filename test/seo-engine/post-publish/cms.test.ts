import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_API_TOKEN: 'test-token', WEBFLOW_ARTICLES_COLLECTION_ID: 'collection' } }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/seo-engine/opportunity-engine/locale', () => ({
  cmsLocaleIdFor: (locale: string) => `${locale}-id`,
  publicArticleUrl: (slug: string, locale: string) => `https://www.aproposmagazine.com/${locale === 'en' ? 'en/' : ''}articles/${slug}`,
}));
vi.mock('@/lib/seo-engine/webflow-adapter', () => ({
  getCmsSeoSlugs: () => ({ seoTitle: 'seo-title', metaDescription: 'meta-description' }),
  toWebflowSeoPatch: (p: Record<string, string>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v).map(([k, v]) => [k === 'seoTitle' ? 'seo-title' : 'meta-description', v])),
}));
const lease = vi.hoisted(() => ({ assertOwned: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({ acquireCmsWriteLease: async () => lease }));
import { applyPublishedMetadata, readPublishedArticle, verifyPublicMetadata } from '../../../lib/seo-engine/post-publish/cms';

const item = { id: 'item', cmsLocaleId: 'da-id', lastPublished: '2026-09-12', fieldData: {
  name: 'Mayday', content: '<p>Article</p>', slug: 'mayday', 'seo-title': 'Mayday', 'meta-description': 'Review',
} };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('published metadata CMS adapter', () => {
  it('patches only metadata in the requested locale and verifies CMS plus HTML', async () => {
    let current = structuredClone(item);
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        expect(url).toBe('https://api.webflow.com/v2/collections/collection/items/live');
        const body = JSON.parse(String(options.body));
        expect(body).toEqual({ items: [{ id: 'item', cmsLocaleId: 'da-id', fieldData: { 'seo-title': 'Mayday: Anmeldelse' } }] });
        current.fieldData['seo-title'] = body.items[0].fieldData['seo-title'];
        return Response.json({ items: [current] });
      }
      if (url.startsWith('https://www.')) return new Response('<head><title>Mayday: Anmeldelse</title><meta name="description" content="Review"></head>');
      return Response.json(current);
    });
    vi.stubGlobal('fetch', fetcher);
    const before = await readPublishedArticle('item', 'da');
    const beforeWrite = vi.fn();
    const result = await applyPublishedMetadata({ analyzed: before.snapshot, patch: { seoTitle: 'Mayday: Anmeldelse' }, beforeWrite });
    expect(result.after.metadata.seoTitle).toBe('Mayday: Anmeldelse');
    expect(beforeWrite).toHaveBeenCalledOnce();
    expect(lease.release).toHaveBeenCalledOnce();
  });
  it('refuses staged editorial changes before issuing a write', async () => {
    const fetcher = vi.fn(async () => Response.json(item));
    vi.stubGlobal('fetch', fetcher);
    const before = await readPublishedArticle('item', 'da');
    fetcher.mockImplementation(async (url?: unknown) => Response.json(String(url).includes('/live?') ? item : {
      ...item, fieldData: { ...item.fieldData, content: '<p>New draft</p>' },
    }));
    await expect(applyPublishedMetadata({ analyzed: before.snapshot, patch: { seoTitle: 'New' }, beforeWrite: vi.fn() })).rejects.toThrow('article_changed');
    expect(fetcher.mock.calls.every(call => (call as unknown[]).length === 0 || !JSON.stringify(call).includes('PATCH'))).toBe(true);
  });
  it('never treats a CMS success as proof that the public metadata is updated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<head><title>Old</title><meta name="description" content="Review"></head>')));
    await expect(verifyPublicMetadata('https://www.aproposmagazine.com/articles/mayday', {
      seoTitle: 'New', metaDescription: 'Review',
    })).rejects.toThrow('metadata_pending');
  });
  it('does not fetch an untrusted verification URL', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(verifyPublicMetadata('http://localhost/private', { seoTitle: '', metaDescription: '' })).rejects.toThrow('not_allowed');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
