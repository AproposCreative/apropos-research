import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ apiToken: 'test-only' }) }));
import { inspectLivCmsDraft, readLivWebflowJson } from '@/lib/liv/cms-readback';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { encodeWebp } from '@/lib/images/encode-webp';

const collectionId = 'a'.repeat(24), localeId = 'b'.repeat(24), itemId = 'c'.repeat(24);
const authorId = 'd'.repeat(24), sectionId = 'e'.repeat(24);
const authorCollection = '1'.repeat(24), sectionCollection = '2'.repeat(24);
const expected: WebflowArticleFields = { id: 'liv', title: 'Et museum åbner', slug: 'et-museum-aabner',
  content: 'Indhold', intro: 'Intro', subtitle: 'Undertitel', seoTitle: 'SEO', seoDescription: 'Meta', author: 'Liv Brandt',
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
const topicCollection = '3'.repeat(24), filmId = '4'.repeat(24), reviewId = '5'.repeat(24);
function topicFixture() {
  const f = fixture();
  f.schema.fields.push({ slug: 'topic', type: 'Reference', validations: { collectionId: topicCollection } },
    { slug: 'topics', type: 'MultiReference', validations: { collectionId: topicCollection } });
  Object.assign(f.item.fieldData, { topic: filmId, topics: [filmId, reviewId] });
  const items = [
    { id: filmId, cmsLocaleId: localeId, isDraft: false, isArchived: false, fieldData: { name: 'Film', slug: 'film' } },
    { id: reviewId, cmsLocaleId: localeId, isDraft: false, isArchived: false, fieldData: { name: 'Anmeldelser', slug: 'anmeldelser' } },
  ];
  const original = f.read.getMockImplementation()!;
  f.read.mockImplementation(async path => path === `collections/${topicCollection}/items?cmsLocaleId=${localeId}&offset=0&limit=100`
    ? { items } : original(path));
  return { ...f, items };
}
it('checks optional topic fields when requested, ignoring non-taxonomy tags and fetching the collection once', async () => {
  const f = topicFixture();
  const result = await inspectLivCmsDraft({ itemId, expected: { ...expected, topicsSelected: ['Film', 'lgbt', 'identitet', 'Anmeldelse'] } }, f.dependencies);
  expect(result.checks).toContainEqual({ id: 'reference:topic', ok: true });
  expect(result.checks).toContainEqual({ id: 'reference:topics', ok: true });
  expect(f.read.mock.calls.filter(([path]) => path.startsWith(`collections/${topicCollection}/items?`))).toHaveLength(1);
});
it.each(['missing-fields', 'missing-primary', 'missing-multi', 'primary-not-in-multi', 'wrong-primary', 'wrong-collection',
  'wrong-locale', 'archived', 'missing-resolved-topic', 'ambiguous'])('rejects requested taxonomy readback: %s', async defect => {
  const f = topicFixture();
  if (defect === 'missing-fields') f.schema.fields = f.schema.fields.filter(field => !['topic', 'topics'].includes(field.slug));
  if (defect === 'missing-primary') Object.assign(f.item.fieldData, { topic: null });
  if (defect === 'missing-multi') Object.assign(f.item.fieldData, { topics: [] });
  if (defect === 'primary-not-in-multi') Object.assign(f.item.fieldData, { topics: [reviewId] });
  if (defect === 'wrong-primary') Object.assign(f.item.fieldData, { topic: reviewId });
  if (defect === 'wrong-collection') f.schema.fields.find(field => field.slug === 'topics')!.validations!.collectionId = '9'.repeat(24);
  if (defect === 'wrong-locale') f.items[0].cmsLocaleId = '9'.repeat(24);
  if (defect === 'archived') f.items[0].isArchived = true;
  if (defect === 'missing-resolved-topic') Object.assign(f.item.fieldData, { topics: [filmId] });
  if (defect === 'ambiguous') f.items.push({ ...f.items[0], id: '9'.repeat(24) });
  const result = await inspectLivCmsDraft({ itemId, expected: { ...expected, topicsSelected: ['Film', 'Anmeldelser'] } }, f.dependencies);
  expect(result.checks.filter(check => check.id.startsWith('reference:topic')).some(check => !check.ok)).toBe(true);
  expect(result.publicationReady).toBe(false);
});
it.each([undefined, []])('keeps legacy no-selection readbacks unchanged: %j', async topicsSelected => {
  const f = fixture();
  const result = await inspectLivCmsDraft({ itemId, expected: { ...expected, topicsSelected } }, f.dependencies);
  expect(result.checks.some(check => check.id.startsWith('reference:topic'))).toBe(false);
  expect(f.read.mock.calls.some(([path]) => path.includes('/items?'))).toBe(false);
});
it('allows only bounded locale-scoped collection pagination reads', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ items: [] })); vi.stubGlobal('fetch', fetchMock);
  await expect(readLivWebflowJson(`collections/${topicCollection}/items?cmsLocaleId=${localeId}&offset=0&limit=100`)).resolves.toEqual({ items: [] });
  for (const query of [`cmsLocaleId=${localeId}&offset=1&limit=100`, `cmsLocaleId=${localeId}&offset=5000&limit=100`,
    `cmsLocaleId=${localeId}&offset=0&limit=200`, 'url=https://evil.example']) {
    await expect(readLivWebflowJson(`collections/${topicCollection}/items?${query}`)).rejects.toThrow('invalid_path');
  }
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each([[1920, 1080], [1200, 675]])('can pass with verified %i x %i hero bytes and two distinct credited body images, without certifying rights', async (width, height) => {
  const f = fixture();
  const buffers = await Promise.all(['#aaa', '#bbb', '#ccc'].map(background =>
    sharp({ create: { width, height, channels: 3, background } }).webp().toBuffer()));
  const content = '<p>Indhold</p>' + [1, 2].map(i => `<figure><img src="https://example.com/${i}.webp" alt="Motiv ${i}" style="height:auto"><figcaption>Motiv ${i}. Foto: Fotograf.</figcaption></figure>`).join('');
  f.item.fieldData.content = content;
  Object.assign(f.item.fieldData.thumb, { alt: 'Hero motiv' });
  const payload = { ...expected, content, featuredImage: 'https://example.com/image.webp',
    featuredImageHash: createHash('sha256').update(buffers[0]).digest('hex'), featuredImageAlt: 'Hero motiv', fotoCredit: 'AI-illustration' };
  const readImage = vi.fn(async (url: string) => buffers[url.includes('/1.') ? 1 : url.includes('/2.') ? 2 : 0]);
  const result = await inspectLivCmsDraft({ itemId, expected: payload }, { ...f.dependencies, readImage });
  expect(result.checks.filter(check => !check.ok)).toEqual([]);
  expect(result.publicationReady).toBe(true);
  readImage.mockResolvedValue(buffers[0]);
  const duplicate = await inspectLivCmsDraft({ itemId, expected: payload }, { ...f.dependencies, readImage });
  expect(duplicate.publicationReady).toBe(false);
  expect(duplicate.checks).toContainEqual({ id: 'image:body-assets', ok: false });
});
it('compares all visible body/intro text instead of mere presence', async () => {
  const f = fixture(); f.item.fieldData.content = '<p>Indhold med en opdigtet slutning</p>'; f.item.fieldData.intro = 'En anden intro';
  const result = await inspectLivCmsDraft({ itemId, expected }, f.dependencies);
  expect(result.checks).toContainEqual({ id: 'field:content', ok: false });
  expect(result.checks).toContainEqual({ id: 'field:intro', ok: false });
});
it('verifies an explicitly disabled AI label rather than requiring it to be enabled', async () => {
  const f = fixture();
  f.item.fieldData['ai-generated'] = false;
  const result = await inspectLivCmsDraft({ itemId, expected: { ...expected, aiGenerated: false } }, f.dependencies);
  expect(result.checks).toContainEqual({ id: 'field:ai-generated', ok: true });
  const mismatch = await inspectLivCmsDraft({ itemId, expected: { ...expected, aiGenerated: true } }, f.dependencies);
  expect(mismatch.checks).toContainEqual({ id: 'field:ai-generated', ok: false });
});
it('checks actual CMS bytes even when Webflow rewrites the URL, and rejects changed pixels/alt/credit', async () => {
  const f = fixture();
  const bytes = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#ddd' } }).webp().toBuffer();
  const payload = { ...expected, featuredImage: 'https://museum.dk/original.webp', featuredImageHash: createHash('sha256').update(bytes).digest('hex'), featuredImageAlt: 'To stole på et museum', fotoCredit: 'Fotograf' };
  Object.assign(f.item.fieldData.thumb, { alt: payload.featuredImageAlt }); f.item.fieldData['foto-credit'] = 'Fotograf';
  const readImage = vi.fn().mockResolvedValue(bytes);
  const result = await inspectLivCmsDraft({ itemId, expected: payload }, { ...f.dependencies, readImage });
  expect(result.checks).toContainEqual({ id: 'image:stored-bytes-match', ok: true }); expect(result.publicationReady).toBe(false);
  expect(readImage).toHaveBeenCalledWith('https://example.com/image.webp');
  readImage.mockResolvedValue(Buffer.from('changed')); Object.assign(f.item.fieldData.thumb, { alt: 'Andet motiv' }); f.item.fieldData['foto-credit'] = 'Anden';
  const changed = await inspectLivCmsDraft({ itemId, expected: payload }, { ...f.dependencies, readImage });
  for (const id of ['image:stored-bytes-match', 'image:alt-matches', 'image:credit-matches']) expect(changed.checks).toContainEqual({ id, ok: false });
});
it('checks the actual CMS star field for a rated article', async () => {
  const f = fixture();
  f.schema.fields.push({ slug: 'stjerne', type: 'Number' });
  Object.assign(f.item.fieldData, { stjerne: 4 });
  const result = await inspectLivCmsDraft({ itemId, expected: { ...expected, rating: 4 } }, f.dependencies);
  expect(result.checks.find(check => check.id === 'field:stjerne')?.ok).toBe(true);
  Object.assign(f.item.fieldData, { stjerne: 5 });
  const mismatch = await inspectLivCmsDraft({ itemId, expected: { ...expected, rating: 4 } }, f.dependencies);
  expect(mismatch.checks.find(check => check.id === 'field:stjerne')?.ok).toBe(false);
});
it('reads actual schema and referenced author/section, without certifying image rights', async () => {
  const f = fixture();
  const result = await inspectLivCmsDraft({ itemId, expected }, f.dependencies);
  expect(result.draftConfirmed).toBe(true);
  expect(result.publicationReady).toBe(false);
  expect(result.checks.filter(c => !c.ok).map(c => c.id)).toEqual(['image:selection-proof', 'image:body-count', 'image:body-assets']);
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

describe('body image byte binding after deterministic CMS optimization', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function optimizedFixture() {
    vi.stubEnv('WEBFLOW_CONTENT_IMAGE_MAX_KB', '200');
    vi.stubEnv('WEBFLOW_CONTENT_IMAGE_MAX_EDGE', '1200');
    const f = fixture();
    const originals = await Promise.all(['#b13251', '#326da8'].map(background =>
      sharp({ create: { width: 1536, height: 1024, channels: 3, background } }).webp().toBuffer()));
    const converted = await Promise.all(originals.map(original => encodeWebp(original,
      { maxSizeKB: 200, maxLongEdge: 1200, qualityStart: 82, qualityMin: 55, effort: 6 })));
    const hero = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#e5c623' } }).webp().toBuffer();
    const originalUrls = [1, 2].map(i => `https://assets.example/original/body-${i}.webp`);
    const optimizedUrls = [1, 2].map(i => `https://assets.example/optimized/body-${i}.webp`);
    const body = (urls: string[]) => '<p>Indhold</p>' + urls.map((url, i) =>
      `<figure><img src="${url}" alt="Motiv ${i + 1}" style="height:auto"><figcaption>Motiv ${i + 1}. Foto: Fotograf.</figcaption></figure>`).join('');
    const payload = { ...expected, content: body(originalUrls), featuredImage: f.item.fieldData.thumb.url,
      featuredImageHash: createHash('sha256').update(hero).digest('hex'), featuredImageAlt: 'Hero motiv', fotoCredit: 'AI-illustration' };
    f.item.fieldData.content = body(optimizedUrls);
    Object.assign(f.item.fieldData.thumb, { alt: payload.featuredImageAlt });
    const assets = new Map<string, Buffer>([[payload.featuredImage, hero],
      ...originalUrls.map((url, i) => [url, originals[i]] as [string, Buffer]),
      ...optimizedUrls.map((url, i) => [url, converted[i].data] as [string, Buffer])]);
    const readImage = vi.fn(async (url: string) => {
      const bytes = assets.get(url);
      if (!bytes) throw new Error('test asset unavailable');
      return bytes;
    });
    return { ...f, payload, originals, converted, originalUrls, optimizedUrls, assets, readImage };
  }

  it('accepts two actual 1200x800 deterministic derivatives of distinct 1536x1024 originals and reads both sides', async () => {
    const f = await optimizedFixture();
    for (const [i, converted] of f.converted.entries()) {
      expect(await sharp(f.originals[i]).metadata()).toMatchObject({ width: 1536, height: 1024 });
      expect(await sharp(converted.data).metadata()).toMatchObject({ width: 1200, height: 800, format: 'webp' });
      expect(converted.data.equals(f.originals[i])).toBe(false);
    }
    expect(f.converted[0].data.equals(f.converted[1].data)).toBe(false);
    const result = await inspectLivCmsDraft({ itemId, expected: f.payload }, { ...f.dependencies, readImage: f.readImage });
    expect(result.checks.filter(check => !check.ok)).toEqual([]);
    expect(result.publicationReady).toBe(true);
    for (const url of [...f.originalUrls, ...f.optimizedUrls]) expect(f.readImage).toHaveBeenCalledWith(url);
    expect(f.readImage).toHaveBeenCalledTimes(5); // Hero plus both actual/expected body pairs.
  });

  it.each(['swapped', 'wrong-pixels'])('rejects %s despite similar original/optimized filenames and valid distinct assets', async kind => {
    const f = await optimizedFixture();
    if (kind === 'swapped') {
      f.assets.set(f.optimizedUrls[0], f.converted[1].data);
      f.assets.set(f.optimizedUrls[1], f.converted[0].data);
    } else {
      const wrong = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#17be85' } }).webp().toBuffer();
      f.assets.set(f.optimizedUrls[0], wrong);
    }
    const result = await inspectLivCmsDraft({ itemId, expected: f.payload }, { ...f.dependencies, readImage: f.readImage });
    expect(result.publicationReady).toBe(false);
    expect(result.checks).toContainEqual({ id: 'image:body-matches', ok: false });
    expect(result.checks).toContainEqual({ id: 'image:body-assets', ok: true });
    expect(result.checks).toContainEqual({ id: 'field:content', ok: true });
  });

  it.each(['alt', 'caption'])('still rejects changed %s when both deterministic image conversions are exact', async kind => {
    const f = await optimizedFixture();
    f.item.fieldData.content = kind === 'alt'
      ? f.item.fieldData.content.replace('alt="Motiv 1"', 'alt="Et forkert motiv"')
      : f.item.fieldData.content.replace('Motiv 1. Foto: Fotograf.', 'En forkert billedtekst. Foto: Fotograf.');
    const result = await inspectLivCmsDraft({ itemId, expected: f.payload }, { ...f.dependencies, readImage: f.readImage });
    expect(result.publicationReady).toBe(false);
    expect(result.checks).toContainEqual({ id: 'image:body-matches', ok: false });
    expect(result.checks).toContainEqual({ id: 'image:body-assets', ok: true });
    if (kind === 'caption') expect(result.checks).toContainEqual({ id: 'field:content', ok: false });
  });

  it('keeps duplicate-pixel rejection even when optimized URLs are distinct', async () => {
    const f = await optimizedFixture();
    f.assets.set(f.optimizedUrls[1], f.converted[0].data);
    const result = await inspectLivCmsDraft({ itemId, expected: f.payload }, { ...f.dependencies, readImage: f.readImage });
    expect(result.publicationReady).toBe(false);
    expect(result.checks).toContainEqual({ id: 'image:body-assets', ok: false });
  });

  it('fails closed if the expected original cannot be read, even when optimized pixels are otherwise valid', async () => {
    const f = await optimizedFixture(); f.assets.delete(f.originalUrls[0]);
    const result = await inspectLivCmsDraft({ itemId, expected: f.payload }, { ...f.dependencies, readImage: f.readImage });
    expect(result.publicationReady).toBe(false);
    expect(result.checks).toContainEqual({ id: 'image:body-matches', ok: false });
    expect(result.checks).toContainEqual({ id: 'image:body-assets', ok: false });
  });
});
