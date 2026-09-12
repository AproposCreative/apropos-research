import { expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
import { publishVerifiedLivArticle, verifyLiveLivArticle } from '@/lib/liv/publish-verified';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import type { WebflowArticleFields } from '@/lib/webflow/types';

const itemId = 'a'.repeat(24), collectionId = 'b'.repeat(24), localeId = 'c'.repeat(24);
function fixture() {
  const content = '<p>Første afsnit.</p><p>Andet afsnit med holdning.</p><figure><img src="https://example.com/one.webp"></figure><figure><img src="https://example.com/two.webp"></figure>';
  const expected = { title: 'En artikel', slug: 'en-artikel', content } as WebflowArticleFields;
  const fields = { name: expected.title, slug: expected.slug, content, 'ai-generated': true,
    thumb: { url: 'https://example.com/hero.webp' } };
  const staged = { id: itemId, cmsLocaleId: localeId, isDraft: true, isArchived: false, fieldData: fields };
  const live = { ...staged, isDraft: false, lastPublished: new Date().toISOString() };
  const schema = { id: collectionId, fields: [{ slug: 'publish-date', type: 'DateTime' }] };
  const inspect = vi.fn().mockResolvedValue({ itemId, localeId, draftConfirmed: true,
    publicationReady: true, fieldDataHash: cmsFieldHash(fields), checks: [{ id: 'all', ok: true }] });
  const read = vi.fn(async (path: string) => path === `collections/${collectionId}` ? schema : path.includes('/live?') ? live : staged);
  const publish = vi.fn().mockResolvedValue(undefined);
  const readPage = vi.fn().mockResolvedValue(Buffer.from(`<h1>En artikel</h1><img src="https://example.com/hero.webp">${content}`));
  return { expected, staged, live, schema, inspect, read, publish, readPage,
    deps: { collectionId, localeId, inspect, read, publish, readPage, wait: vi.fn().mockResolvedValue(undefined) } };
}
it('publishes exactly the checked item and locale, then verifies live data and public HTML', async () => {
  const f = fixture();
  const result = await publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps);
  expect(result).toMatchObject({ publicationVerified: true, itemId, localeId,
    publicUrl: 'https://www.aproposmagazine.com/articles/en-artikel' });
  expect(f.publish).toHaveBeenCalledExactlyOnceWith(itemId, localeId);
  expect(f.inspect.mock.invocationCallOrder[0]).toBeLessThan(f.publish.mock.invocationCallOrder[0]);
  expect(f.publish.mock.invocationCallOrder[0]).toBeLessThan(f.readPage.mock.invocationCallOrder[0]);
  expect(f.read).toHaveBeenCalledWith(`collections/${collectionId}/items/${itemId}/live?cmsLocaleId=${localeId}`);
});
it.each([{ publicationReady: false }, { draftConfirmed: false }, { checks: [] },
  { checks: [{ id: 'bad', ok: false }] }, { localeId: 'd'.repeat(24) }])('does not publish with incomplete proof %o', async override => {
  const f = fixture();
  f.inspect.mockResolvedValue({ ...(await f.inspect()), ...override });
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('checks_failed');
  expect(f.publish).not.toHaveBeenCalled();
});
it('detects an edit between inspection and publication', async () => {
  const f = fixture(); f.staged.fieldData['ai-generated'] = false;
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('draft_changed');
  expect(f.publish).not.toHaveBeenCalled();
});
it.each(['identity', 'locale', 'draft', 'timestamp', 'revision'])('rejects incorrect live %s', async failure => {
  const f = fixture();
  if (failure === 'identity') f.live.id = 'd'.repeat(24);
  if (failure === 'locale') f.live.cmsLocaleId = 'd'.repeat(24);
  if (failure === 'draft') f.live.isDraft = true;
  if (failure === 'timestamp') f.live.lastPublished = '';
  if (failure === 'revision') f.live.fieldData = { ...f.live.fieldData, name: 'Gammel version' };
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('live_mismatch');
  expect(f.publish).toHaveBeenCalledTimes(1);
  expect(f.readPage).not.toHaveBeenCalled();
});
it.each(['<h1>Forkert artikel</h1>', '<h1>En artikel</h1><p>Gammel tekst</p>',
  '<h1>En artikel</h1><script>Første afsnit. Andet afsnit med holdning.</script>'])('does not accept a generic HTTP 200 or hidden body: %s', async html => {
  const f = fixture(); f.readPage.mockResolvedValue(Buffer.from(html));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('public_page_mismatch');
});
it('requires the public page to contain the CMS images', async () => {
  const f = fixture(); f.readPage.mockResolvedValue(Buffer.from('<h1>En artikel</h1><p>Første afsnit.</p><p>Andet afsnit med holdning.</p>'));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('public_images_missing');
});
it('does not repeat an uncertain external write', async () => {
  const f = fixture(); f.publish.mockRejectedValue(new Error('timeout'));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).rejects.toThrow('timeout');
  expect(f.publish).toHaveBeenCalledTimes(1);
});
it('retries readback after 202 propagation without publishing twice', async () => {
  const f = fixture();
  f.read.mockResolvedValueOnce(f.staged).mockRejectedValueOnce(new Error('liv_cms_readback_http_404'));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected }, f.deps)).resolves.toMatchObject({ publicationVerified: true });
  expect(f.publish).toHaveBeenCalledTimes(1);
  expect(f.deps.wait).toHaveBeenCalledWith(500);
});
it('rejects malformed targets before any access', async () => {
  const f = fixture();
  await expect(publishVerifiedLivArticle({ itemId: '../bad', expected: f.expected }, f.deps)).rejects.toThrow('invalid_identity');
  expect(f.inspect).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
});
it('durably records intent before the external publish', async () => {
  const f = fixture(); const beforePublish = vi.fn().mockResolvedValue(undefined);
  await publishVerifiedLivArticle({ itemId, expected: f.expected, beforePublish }, f.deps);
  expect(beforePublish).toHaveBeenCalledWith(cmsFieldHash(f.staged.fieldData));
  expect(beforePublish.mock.invocationCallOrder[0]).toBeLessThan(f.publish.mock.invocationCallOrder[0]);
});
it('does not publish if the intent checkpoint cannot be saved', async () => {
  const f = fixture();
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected,
    beforePublish: async () => { throw new Error('database unavailable'); } }, f.deps)).rejects.toThrow('database unavailable');
  expect(f.publish).not.toHaveBeenCalled();
});
it('reconciles a successful but unacknowledged write using reads only', async () => {
  const f = fixture();
  await expect(verifyLiveLivArticle({ itemId, expected: f.expected,
    fieldDataHash: cmsFieldHash(f.live.fieldData) }, f.deps)).resolves.toMatchObject({ publicationVerified: true });
  expect(f.publish).not.toHaveBeenCalled(); expect(f.inspect).not.toHaveBeenCalled();
  expect(f.read.mock.calls.every(([path]) => path.includes('/live?'))).toBe(true);
});
it('sets the selected publication date before final CMS proof, including for reserves', async () => {
  const f = fixture(); const date = '2026-09-11T08:00:00.000Z'; const assertLease = vi.fn().mockResolvedValue(undefined);
  const patchDate = vi.fn(async (_id: string, data: Record<string, unknown>) => {
    Object.assign(f.staged.fieldData, data);
    f.inspect.mockResolvedValue({ ...(await f.inspect()), fieldDataHash: cmsFieldHash(f.staged.fieldData) });
  });
  await publishVerifiedLivArticle({ itemId, expected: f.expected, publicationDate: date, assertLease }, { ...f.deps, patchDate });
  expect(patchDate).toHaveBeenCalledWith(itemId, { 'publish-date': date }, localeId);
  expect(assertLease.mock.invocationCallOrder[0]).toBeLessThan(patchDate.mock.invocationCallOrder[0]);
  expect(patchDate.mock.invocationCallOrder[0]).toBeLessThan(f.publish.mock.invocationCallOrder[0]);
});
it('does not publish if the date patch fails', async () => {
  const f = fixture();
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected, publicationDate: '2026-09-11T08:00:00Z',
    assertLease: async () => {} }, { ...f.deps, patchDate: async () => { throw new Error('network'); } })).rejects.toThrow('network');
  expect(f.publish).not.toHaveBeenCalled();
});

it('skips the absent publish-date field, preserves event dates, and still proves the exact live/public revision', async () => {
  const f = fixture(); const date = '2026-09-12T08:00:00.000Z';
  f.schema.fields = [{ slug: 'start-dato', type: 'DateTime' }, { slug: 'slut-dato', type: 'DateTime' }];
  Object.assign(f.staged.fieldData, { 'start-dato': '2026-10-01T00:00:00Z', 'slut-dato': '2026-10-02T00:00:00Z' });
  f.inspect.mockResolvedValue({ ...(await f.inspect()), fieldDataHash: cmsFieldHash(f.staged.fieldData) });
  f.inspect.mockClear();
  const original = structuredClone(f.staged.fieldData);
  const patchDate = vi.fn(); const assertLease = vi.fn().mockResolvedValue(undefined);
  const beforePublish = vi.fn().mockResolvedValue(undefined);
  const result = await publishVerifiedLivArticle({ itemId, expected: f.expected,
    publicationDate: date, assertLease, beforePublish }, { ...f.deps, patchDate });
  expect(result.publicationVerified).toBe(true);
  expect(patchDate).not.toHaveBeenCalled();
  expect(f.staged.fieldData).toEqual(original);
  expect(f.inspect).toHaveBeenCalledTimes(1);
  expect(assertLease).toHaveBeenCalledTimes(2);
  expect(beforePublish).toHaveBeenCalledWith(cmsFieldHash(original));
  expect(f.publish).toHaveBeenCalledExactlyOnceWith(itemId, localeId);
  expect(f.read).toHaveBeenCalledWith(`collections/${collectionId}/items/${itemId}/live?cmsLocaleId=${localeId}`);
  expect(f.readPage).toHaveBeenCalledTimes(1);
});

it.each(['timestamp', 'cms-gate', 'public-text', 'public-images', 'lease'])('does not bypass %s when the optional CMS date field is absent', async failure => {
  const f = fixture(); f.schema.fields = [{ slug: 'start-dato', type: 'DateTime' }];
  const patchDate = vi.fn(); const assertLease = vi.fn().mockResolvedValue(undefined);
  if (failure === 'timestamp') f.live.lastPublished = '';
  if (failure === 'cms-gate') f.inspect.mockResolvedValue({ ...(await f.inspect()), publicationReady: false });
  if (failure === 'public-text') f.readPage.mockResolvedValue(Buffer.from('<h1>En artikel</h1><p>Forkert tekst.</p>'));
  if (failure === 'public-images') f.readPage.mockResolvedValue(Buffer.from('<h1>En artikel</h1><p>Første afsnit.</p><p>Andet afsnit med holdning.</p>'));
  if (failure === 'lease') assertLease.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('liv_delivery_lease_lost'));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected,
    publicationDate: '2026-09-12T08:00:00.000Z', assertLease }, { ...f.deps, patchDate })).rejects.toThrow();
  expect(patchDate).not.toHaveBeenCalled();
  expect(f.publish).toHaveBeenCalledTimes(['cms-gate', 'lease'].includes(failure) ? 0 : 1);
});

it.each(['wrong-type', 'duplicate', 'missing-fields', 'wrong-collection', 'unavailable'])('fails closed for %s schema instead of treating it as an absent date field', async failure => {
  const f = fixture(); const patchDate = vi.fn();
  if (failure === 'wrong-type') f.schema.fields[0].type = 'PlainText';
  if (failure === 'duplicate') f.schema.fields.push({ ...f.schema.fields[0] });
  if (failure === 'missing-fields') f.schema.fields = [];
  if (failure === 'wrong-collection') f.schema.id = 'd'.repeat(24);
  if (failure === 'unavailable') f.read.mockRejectedValueOnce(new Error('liv_cms_readback_http_503'));
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected,
    publicationDate: '2026-09-12T08:00:00.000Z', assertLease: async () => {} }, { ...f.deps, patchDate })).rejects.toThrow();
  expect(patchDate).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
});

it('requires readback of the requested date when the DateTime field exists, not just a successful patch response', async () => {
  const f = fixture(); const patchDate = vi.fn().mockResolvedValue(undefined);
  await expect(publishVerifiedLivArticle({ itemId, expected: f.expected,
    publicationDate: '2026-09-12T08:00:00.000Z', assertLease: async () => {} }, { ...f.deps, patchDate })).rejects.toThrow('draft_changed');
  expect(patchDate).toHaveBeenCalledTimes(1); expect(f.publish).not.toHaveBeenCalled();
});

it('does not repeat an already-correct date patch', async () => {
  const f = fixture(); const publicationDate = '2026-09-12T08:00:00.000Z';
  Object.assign(f.staged.fieldData, { 'publish-date': publicationDate });
  f.inspect.mockResolvedValue({ ...(await f.inspect()), fieldDataHash: cmsFieldHash(f.staged.fieldData) });
  const patchDate = vi.fn();
  await publishVerifiedLivArticle({ itemId, expected: f.expected, publicationDate, assertLease: async () => {} }, { ...f.deps, patchDate });
  expect(patchDate).not.toHaveBeenCalled(); expect(f.publish).toHaveBeenCalledTimes(1);
});
