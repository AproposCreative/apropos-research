import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_API_TOKEN: 'test', WEBFLOW_ARTICLES_COLLECTION_ID: 'collection',
  WEBFLOW_CMS_LOCALE_DK: 'da-id', WEBFLOW_CMS_LOCALE_EN: 'en-id' } }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/webflow/article-translation-settings', () => ({ resolveAutoTranslateEnabled: async () => false }));
vi.mock('@/lib/seo-engine/post-publish/editorial', () => ({ assertEditorialMetadataWritable: m.guard }));
import { patchArticleFieldDataForLocale } from '../../../lib/webflow/locale-items';

describe('shared CMS metadata lock guard', () => {
  beforeEach(() => { m.guard.mockReset(); vi.stubGlobal('fetch', vi.fn(async () => Response.json({}))); });
  afterEach(() => vi.unstubAllGlobals());
  it('preserves filled Liv metadata and exact payload when no editorial lock exists', async () => {
    const fields = { 'seo-title': 'Mayday: Anmeldelse', 'meta-description': 'Konkret vurdering.', content: '<p>Saved editorial text</p>' };
    await patchArticleFieldDataForLocale('item', fields, 'da-id');
    expect(m.guard).toHaveBeenCalledWith('item', 'da', ['seoTitle', 'metaDescription']);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ items: [{ id: 'item', cmsLocaleId: 'da-id', fieldData: fields }] });
  });
  it('blocks protected metadata before network transport', async () => {
    m.guard.mockRejectedValue(new Error('SEO-feltet er låst'));
    await expect(patchArticleFieldDataForLocale('item', { 'seo-title': 'New' }, 'en-id')).rejects.toThrow('låst');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not change non-metadata CMS operations', async () => {
    await patchArticleFieldDataForLocale('item', { content: '<p>Body</p>' }, 'da-id');
    expect(m.guard).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
