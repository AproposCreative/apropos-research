import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  fetch: vi.fn(), readback: vi.fn(), seo: vi.fn(), optimize: vi.fn(),
  fields: undefined as Record<string, unknown> | undefined,
  collectionId: '111111111111111111111111', itemId: '222222222222222222222222',
  localeId: '333333333333333333333333',
  topicItems: [] as Array<{ id: string; cmsLocaleId: string; fieldData: { name: string; slug: string } }>,
}));
vi.mock('@/lib/config/env', () => ({ env: {
  WEBFLOW_CMS_LOCALE_DK: state.localeId, WEBFLOW_CMS_LOCALE_EN: '555555555555555555555555',
} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({
  apiToken: 'unit-test-placeholder', siteId: '444444444444444444444444', articlesCollectionId: state.collectionId,
}), saveWebflowConfig: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// Controlled schema/mapping fixture; the service's buildFieldDataFromMapping,
// Boolean transform, schema filtering and HTTP serialization remain REAL.
vi.mock('@/lib/webflow-mapping', () => ({ readMapping: () => ({ entries: [
  { internal: 'title', webflowSlug: 'name', transform: 'identity', required: true },
  { internal: 'slug', webflowSlug: 'slug', transform: 'identity', required: true },
  { internal: 'content', webflowSlug: 'content', transform: 'plainToHtml', required: true },
  { internal: 'aiGenerated', webflowSlug: 'ai-generated', transform: 'boolean' },
  { internal: 'topic', webflowSlug: 'topic', transform: 'identity' },
  { internal: 'topics', webflowSlug: 'topics', transform: 'identity' },
] }) }));
vi.mock('@/lib/webflow/article-image-auto-optimize', () => ({ autoOptimizeArticleFieldData: state.optimize }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: state.readback }));
vi.mock('@/lib/seo-engine/after-publish', () => ({ maybeEnqueueSeoEngineAfterPublish: state.seo }));

import { publishArticleDraftToWebflow } from '@/lib/articles/publish';
import { publishArticleToWebflow } from '@/lib/webflow-service';
import type { ArticlePayload } from '@/lib/articles/article-payload';
import type { WebflowArticleFields } from '@/lib/webflow/types';

beforeEach(() => {
  vi.resetAllMocks();
  state.optimize.mockResolvedValue({ thumbOptimized: false, mobileOptimized: false, contentImagesOptimized: 0 });
  state.fields = undefined;
  state.topicItems = [
    { id: '67dbf17ba540975b5b21c303', cmsLocaleId: state.localeId, fieldData: { name: 'Film', slug: 'film' } },
    { id: '67e6f8f2e077ea42a9b95b87', cmsLocaleId: state.localeId, fieldData: { name: 'Anmeldelser', slug: 'anmeldelser' } },
  ];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', state.fetch);
  state.fetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const base = `https://api.webflow.com/v2/collections/${state.collectionId}`;
    if (input === base && (!init?.method || init.method === 'GET')) {
      return Response.json({ fields: [...['name', 'slug', 'content', 'ai-generated'].map(slug => ({ slug,
        type: slug === 'ai-generated' ? 'Switch' : 'PlainText', required: slug !== 'ai-generated' })),
        { slug: 'topic', type: 'Reference', validations: { collectionId: '67dbf17ba540975b5b21c2af' } },
        { slug: 'topics', type: 'MultiReference', validations: { collectionId: '67dbf17ba540975b5b21c2af' } }] });
    }
    if (input === `https://api.webflow.com/v2/collections/67dbf17ba540975b5b21c2af/items?offset=0&limit=100&cmsLocaleId=${state.localeId}`) {
      return Response.json({ items: state.topicItems });
    }
    if ((input === `${base}/items/bulk` && init?.method === 'POST') ||
        (input === `${base}/items/${state.itemId}` && init?.method === 'PATCH')) {
      const body = JSON.parse(String(init.body));
      state.fields = structuredClone(body.fieldData);
      return Response.json(init.method === 'POST' ? { items: [{ id: state.itemId }] } : { id: state.itemId });
    }
    throw new Error(`Unexpected stubbed Webflow request: ${init?.method || 'GET'} ${input}`);
  });
  // Remote readback reflects ONLY the fields captured from the real service's
  // serialized write. No hard-coded AI-label value can make this check pass.
  state.readback.mockImplementation(async (path: string) => {
    expect(path).toBe(`collections/${state.collectionId}/items/${state.itemId}?cmsLocaleId=${state.localeId}`);
    if (!state.fields) throw new Error('Readback before write');
    return { id: state.itemId, cmsLocaleId: state.localeId, isDraft: true, isArchived: false,
      fieldData: structuredClone(state.fields) };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const baseArticle = { title: 'Liv og kulturens rum', slug: 'liv-og-kulturens-rum', content: '<p>En original kulturartikel.</p>',
  featuredImage: 'https://assets.test/cover.webp', aiModel: 'test-model', aiSourceUrl: 'https://source.test/article' };

it.each([
  { name: 'Liv explicit off', input: { source: 'liv', author: 'Liv Brandt', aiGenerated: false }, expected: false },
  { name: 'Liv source default', input: { source: 'liv', author: 'Redaktionen' }, expected: false },
  { name: 'Liv author default', input: { source: 'ai', author: 'Liv Brandt' }, expected: false },
  { name: 'Liv explicit on', input: { source: 'liv', author: 'Liv Brandt', aiGenerated: true }, expected: true },
  { name: 'other AI author unchanged', input: { source: 'ai', author: 'Redaktionen' }, expected: true },
  { name: 'other author explicit off', input: { source: 'ai', author: 'Redaktionen', aiGenerated: false }, expected: false },
])('persists $name through normalization, real service mapping, HTTP write and staged readback', async ({ input, expected }) => {
  const result = await publishArticleDraftToWebflow({ ...baseArticle, ...input } as Partial<ArticlePayload> & typeof baseArticle);
  expect(result.articleId).toBe(state.itemId);
  expect(state.fields).toHaveProperty('ai-generated', expected);
  expect(typeof state.fields!['ai-generated']).toBe('boolean');
  const writes = state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ isDraft: true, cmsLocaleIds: [state.localeId, '555555555555555555555555'],
    fieldData: { name: baseArticle.title, slug: baseArticle.slug, content: baseArticle.content, 'ai-generated': expected } });
  expect(state.readback).toHaveBeenCalledTimes(1);
  const saved = await state.readback.mock.results[0].value;
  expect(saved.fieldData['ai-generated']).toBe(expected);
  expect(result.payload).toMatchObject({ aiGenerated: expected, aiModel: baseArticle.aiModel, aiSourceUrl: baseArticle.aiSourceUrl });
  expect(result).toMatchObject({ publicationVerified: false, receipt: { saveState: 'draft', saveVerified: true } });
  expect(state.fetch).toHaveBeenCalledTimes(2); // Schema and staged create only, never live publication.
});

it.each([false, true, undefined])('preserves direct service Liv toggle=%s on the actual update request', async aiGenerated => {
  await publishArticleToWebflow({ ...baseArticle, author: 'Liv Brandt', aiGenerated,
    webflowId: state.itemId, status: 'draft' } as WebflowArticleFields);
  const updates = state.fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');
  expect(updates).toHaveLength(1);
  expect(JSON.parse(updates[0][1].body)).toMatchObject({ cmsLocaleId: state.localeId,
    fieldData: { 'ai-generated': aiGenerated ?? false } });
  expect(state.fields!['ai-generated']).toBe(aiGenerated ?? false);
  expect(state.fetch).toHaveBeenCalledTimes(2);
});
it('resolves all topic candidates with one canonical collection fetch and writes ordered primary/multi references', async () => {
  await publishArticleToWebflow({ ...baseArticle, author: 'Liv Brandt', aiGenerated: false, status: 'draft',
    topicsSelected: ['Film', 'lgbt', 'identitet', 'Anmeldelse', 'film'] } as WebflowArticleFields);
  expect(state.fields).toMatchObject({ topic: state.topicItems[0].id, topics: state.topicItems.map(item => item.id), 'ai-generated': false });
  expect(state.fetch.mock.calls.filter(([url]) => url.includes('/67dbf17ba540975b5b21c2af/items?'))).toHaveLength(1);
  expect(state.fetch.mock.calls.some(([url]) => url.includes('/sites/'))).toBe(false);
});
it('shares the collection fetch for legacy manual primary/multi names while preserving direct IDs', async () => {
  await publishArticleToWebflow({ ...baseArticle, status: 'draft', topic: 'Film', topics: ['Anmeldelse', state.topicItems[0].id] } as unknown as WebflowArticleFields);
  expect(state.fields).toMatchObject({ topic: state.topicItems[0].id, topics: [state.topicItems[1].id, state.topicItems[0].id] });
  expect(state.fetch.mock.calls.filter(([url]) => url.includes('/67dbf17ba540975b5b21c2af/items?'))).toHaveLength(1);
});
it.each(['unresolved', 'ambiguous', 'upstream'])('does not silently omit explicit topics after %s resolution', async failure => {
  if (failure === 'ambiguous') state.topicItems.push({ ...state.topicItems[0], id: 'f'.repeat(24) });
  if (failure === 'upstream') {
    const original = state.fetch.getMockImplementation()!;
    state.fetch.mockImplementation((url: string, init?: RequestInit) => url.includes('/67dbf17ba540975b5b21c2af/items?')
      ? Promise.resolve(new Response('', { status: 401 })) : original(url, init));
  }
  await expect(publishArticleToWebflow({ ...baseArticle, status: 'draft',
    topicsSelected: failure === 'unresolved' ? ['Filmfestival', 'identitet'] : ['Film'] } as WebflowArticleFields)).rejects.toThrow(/webflow_topic/);
  expect(state.fetch.mock.calls.filter(([, init]) => ['POST', 'PATCH'].includes(init?.method))).toHaveLength(0);
});

it('awaits the detached canonical content checkpoint after optimization and before the CMS write', async () => {
  const html = '<p>Unchanged review.</p><figure><img src="https://example.com/optimized.webp" alt="Scene"><figcaption>Foto: Producer</figcaption></figure>';
  state.optimize.mockImplementation(async ({ fieldData }) => {
    fieldData.content = html;
    return { thumbOptimized: false, mobileOptimized: false, contentImagesOptimized: 1 };
  });
  let savedExpectation: any;
  const checkpoint = vi.fn(async expected => {
    expect(state.fields).toBeUndefined(); // No CMS write yet.
    expect(expected.content).toBe(html);
    savedExpectation = structuredClone(expected);
    await Promise.resolve();
    expected.content = 'Callback cannot mutate the request';
  });
  const original = structuredClone(baseArticle);
  const result = await publishArticleDraftToWebflow(baseArticle, { onBeforeSave: checkpoint });
  expect(checkpoint).toHaveBeenCalledTimes(1);
  expect(state.fields!.content).toBe(html);
  expect(result.payload.content).toBe(savedExpectation.content);
  expect(baseArticle).toEqual(original);
  expect(state.optimize.mock.invocationCallOrder[0]).toBeLessThan(checkpoint.mock.invocationCallOrder[0]);
  expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(state.readback.mock.invocationCallOrder[0]);
});

it('never sends a CMS write when persisting the canonical expectation fails', async () => {
  const checkpoint = vi.fn().mockRejectedValue(new Error('checkpoint unavailable'));
  await expect(publishArticleDraftToWebflow(baseArticle, { onBeforeSave: checkpoint }))
    .rejects.toMatchObject({ message: 'webflow_save_unverified' });
  expect(checkpoint).toHaveBeenCalledTimes(1);
  expect(state.fetch.mock.calls.filter(([, init]) => ['POST', 'PATCH'].includes(init?.method))).toHaveLength(0);
  expect(state.readback).not.toHaveBeenCalled(); expect(state.seo).not.toHaveBeenCalled();
});
