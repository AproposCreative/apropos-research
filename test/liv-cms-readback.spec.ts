import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ apiToken: 'test-only' }) }));
import { inspectLivCmsDraft, readLivWebflowJson } from '@/lib/liv/cms-readback';
import type { WebflowArticleFields } from '@/lib/webflow/types';

const collectionId = 'a'.repeat(24), localeId = 'b'.repeat(24), itemId = 'c'.repeat(24);
const authorId = 'd'.repeat(24), sectionId = 'e'.repeat(24);
const authorCollection = '1'.repeat(24), sectionCollection = '2'.repeat(24);
const expected: WebflowArticleFields = { id: 'liv', title: 'Et museum åbner', slug: 'et-museum-aabner',
  content: 'Indhold', subtitle: 'Undertitel', seoTitle: 'SEO', seoDescription: 'Meta', author: 'Liv Brandt',
  category: 'Kultur', status: 'draft', tags: [], wordCount: 1000, readTime: 5 };
function fixture() {
  const item = { id: itemId, cmsLocaleId: localeId, isDraft: true, isArchived: false,
    fieldData: { name: expected.title, slug: expected.slug, subtitle: expected.subtitle, 'seo-title': 'SEO',
      'meta-description': 'Meta', content: '<p>Indhold</p>', intro: 'Intro', 'ai-generated': true,
      'word-count': 1000, 'minutes-to-read': 5, author: authorId, section: sectionId,
      presseakkreditering: false, thumb: { url: 'https://example.com/image.webp' }, 'foto-credit': 'AI-illustration' } };
  const schema = { id: collectionId, fields: [
    { slug: 'name', type: 'PlainText', isRequired: true },
    { slug: 'author', type: 'Reference', validations: { collectionId: authorCollection } },
    { slug: 'section', type: 'Reference', reference: { collectionId: sectionCollection } },
  ] };
  const read = vi.fn(async (path: string): Promise<Record<string, unknown>> => {
    if (path === `collections/${collectionId}`) return schema;
    if (path.startsWith(`collections/${collectionId}/items/`)) return item;
    if (path.startsWith(`collections/${authorCollection}/items/`)) return { id: authorId, cmsLocaleId: localeId, fieldData: { name: 'Liv Brandt' } };
    if (path.startsWith(`collections/${sectionCollection}/items/`)) return { id: sectionId, cmsLocaleId: localeId, fieldData: { name: 'Kultur' } };
    throw new Error('unexpected read');
  });
  return { item, schema, read, dependencies: { read, collectionId, localeId } };
}
afterEach(() => vi.unstubAllGlobals());
it('reads actual schema and referenced author/section, without certifying image rights', async () => {
  const f = fixture();
  const result = await inspectLivCmsDraft({ itemId, expected }, f.dependencies);
  expect(result.draftConfirmed).toBe(true);
  expect(result.publicationReady).toBe(false);
  expect(result.checks.filter(c => !c.ok).map(c => c.id)).toEqual(['image:rights-and-asset-unverified']);
  expect(f.read).toHaveBeenCalledTimes(4);
});
it.each(['id', 'cmsLocaleId', 'isDraft', 'isArchived', 'name', 'slug'])('rejects a mismatched draft identity/state: %s', async key => {
  const f = fixture();
  if (key === 'name' || key === 'slug') f.item.fieldData[key] = 'wrong';
  else Object.assign(f.item, { [key]: key === 'isDraft' ? false : key === 'isArchived' ? true : 'wrong' });
  await expect(inspectLivCmsDraft({ itemId, expected }, f.dependencies)).rejects.toThrow('draft_mismatch');
});
it('does not trust an ID-looking author or a silently changed SEO field', async () => {
  const f = fixture();
  f.schema.fields[1].validations = undefined;
  f.item.fieldData['seo-title'] = 'Changed';
  const result = await inspectLivCmsDraft({ itemId, expected }, f.dependencies);
  expect(result.checks).toContainEqual({ id: 'reference:author', ok: false });
  expect(result.checks).toContainEqual({ id: 'field:seo-title', ok: false });
});
it('propagates unavailable reference reads rather than substituting a fallback author', async () => {
  const f = fixture();
  f.read.mockRejectedValue(new Error('unavailable'));
  await expect(inspectLivCmsDraft({ itemId, expected }, f.dependencies)).rejects.toThrow('unavailable');
});
it('rejects missing schema', async () => {
  const f = fixture(); f.schema.fields = [];
  await expect(inspectLivCmsDraft({ itemId, expected }, f.dependencies)).rejects.toThrow('schema_missing');
});
it('rejects invalid IDs before making requests', async () => {
  const f = fixture();
  await expect(inspectLivCmsDraft({ itemId: '../other', expected }, f.dependencies)).rejects.toThrow('invalid_identity');
  expect(f.read).not.toHaveBeenCalled();
});
it('uses bounded uncached GET with redirects disabled', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: itemId })); vi.stubGlobal('fetch', fetchMock);
  expect(await readLivWebflowJson(`collections/${collectionId}`)).toEqual({ id: itemId });
  expect(fetchMock).toHaveBeenCalledWith(`https://api.webflow.com/v2/collections/${collectionId}`, expect.objectContaining({
    cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal),
  }));
});
it.each([
  [new Response('', { status: 401 }), 'http_401'],
  [new Response('<html>'), 'not_json'],
  [new Response('', { headers: { 'content-type': 'application/json' } }), 'invalid_json'],
  [Response.json([]), 'invalid_object'],
  [Response.json({ large: 'x'.repeat(2_000_000) }), 'too_large'],
])('fails closed for invalid upstream responses', async (response, error) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  await expect(readLivWebflowJson(`collections/${collectionId}`)).rejects.toThrow(error);
});
it('cannot send credentials to arbitrary URLs or write endpoints', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  for (const path of ['https://example.com', `collections/${collectionId}/items/publish`, `collections/${collectionId}?token=bad`]) {
    await expect(readLivWebflowJson(path)).rejects.toThrow('invalid_path');
  }
  expect(fetchMock).not.toHaveBeenCalled();
});
