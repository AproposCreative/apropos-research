import { beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any, fields: {} as any, live: {} as any, patch: vi.fn(), read: vi.fn(), proof: vi.fn(), bytes: Buffer.alloc(0), compression: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/config/env', () => ({ env: { WEBFLOW_CMS_LOCALE_DK: 'd'.repeat(24), WEBFLOW_ARTICLES_COLLECTION_ID: 'e'.repeat(24) } }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ articlesCollectionId: 'e'.repeat(24) }) }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: (...args: unknown[]) => state.read(...args), inspectLivCmsDraft: (...args: unknown[]) => state.proof(...args) }));
vi.mock('@/lib/liv/public-media-reader', () => ({ readPublicMedia: async () => state.bytes }));
vi.mock('@/lib/webflow/locale-items', () => ({ patchArticleFieldDataForLocale: (...args: unknown[]) => state.patch(...args) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [], requiredFields: [] }) }));
vi.mock('@/lib/webflow/published-image-optimization', () => ({ verifyCompressedFields: (...args: unknown[]) => state.compression(...args) }));
import { linkPublishedSubmission, linkStagedSubmission, stageSubmissionMedia, verifyStagedMedia, assertMediaOnlyUpdate, assertSubmissionNotAlreadySaved, findBoundCoverByHash } from '@/lib/editorial/submission-published-target';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { projectImageSelection } from '@/lib/editorial/submission-image-selection';
const id = 'a'.repeat(64), itemId = 'b'.repeat(24), path = `editorialSubmissions/${id}`;
const article = { title: 'I mellemtiden er vi ingen', content: '<p>Den præcise anmeldelse.</p>', author: 'author', category: 'culture', rating: 5,
  seoTitle: 'Min SEO titel', seoDescription: 'Min beskrivelse', slug: 'samme-slug' };
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(async () => {
  vi.clearAllMocks(); memory = memoryFirestore(); state.db = memory.db;
  state.bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'orange' } }).png().toBuffer();
  state.fields = { name: article.title, content: article.content, slug: article.slug, author: article.author, section: article.category,
    stjerne: 5, 'seo-title': article.seoTitle, 'meta-description': article.seoDescription, 'book-author': 'Frederik Drescher Kluth',
    'minutes-to-read': 4, 'publish-date': '2026-10-06T21:03:17Z', thumb: { url: 'https://cdn.test/fallback.png' }, other: null };
  state.live = structuredClone(state.fields); delete state.live.other;
  memory.rows.set(path, { id, uid: 'owner', revision: 3, status: 'draft', article, originalArticle: article, contentHash: 'c'.repeat(64), choices: {}, research: [] });
  state.read.mockImplementation(async (url: string) => ({ id: itemId, cmsLocaleId: 'd'.repeat(24), isDraft: false,
    isArchived: false, lastPublished: '2026-10-06T21:03:17Z', fieldData: structuredClone(url.includes('/live?') ? state.live : state.fields) }));
  state.patch.mockImplementation(async (id: string, patch: any) => { expect(id).toBe(itemId); Object.assign(state.fields, patch); });
  state.proof.mockResolvedValue({ publicationReady: true, draftConfirmed: true, fieldDataHash: 'proof' });
  state.compression.mockImplementation(async (expected, actual) => { expect(actual).toEqual(expected); });
});
const target = () => ({ itemId, fields: structuredClone(state.fields), fieldDataHash: cmsFieldHash(state.fields), linkedAt: 'now' });
const expected = () => ({ ...article, tags: [], featuredImage: 'https://cdn.test/selected.png', featuredImageAlt: 'Det valgte mockup', fotoCredit: 'Brugerens billede',
  featuredImageHash: createHash('sha256').update(state.bytes).digest('hex') });
it('links the exact existing DK live item without any CMS write or approval', async () => {
  expect(await linkPublishedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId })).toMatchObject({ itemId, revision: 4, mediaOnly: true, publicationApproval: false });
  expect(memory.rows.get(path).publishedTarget.fields.stjerne).toBe(5); expect(state.patch).not.toHaveBeenCalled();
  expect(memory.rows.get(path).contentHash).not.toBe('c'.repeat(64));
  expect(await linkPublishedSubmission('owner', { submissionId: id, expectedRevision: 4, itemId })).toMatchObject({ revision: 4 });
  await expect(linkPublishedSubmission('other', { submissionId: id, expectedRevision: 3, itemId })).rejects.toThrow('not_found');
});
it('rejects mismatched live/staged state or different copy rather than creating a duplicate', async () => {
  state.live.content = '<p>En andens ændring.</p>';
  await expect(linkPublishedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId })).rejects.toThrow('existing_article_mismatch');
  expect(state.patch).not.toHaveBeenCalled();
});
it('binds one exact never-published draft by pinned CMS hash without a CMS write', async () => {
  delete state.fields.thumb;
  state.read.mockImplementation(async (url: string) => url.includes('/items?')
    ? { items: [{ id: itemId, cmsLocaleId: 'd'.repeat(24), isArchived: false, fieldData: { name: article.title, slug: article.slug } }] }
    : { id: itemId, cmsLocaleId: 'd'.repeat(24), isDraft: true, isArchived: false, lastPublished: null, fieldData: structuredClone(state.fields) });
  const inspected = await linkStagedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId });
  expect(inspected).toMatchObject({ exactDraftMatch: true, cmsWrites: 0, publicationApproval: false, cmsHash: cmsFieldHash(state.fields) });
  expect(memory.rows.get(path).stagedTarget).toBeUndefined();
  const input = { submissionId: id, expectedRevision: 3, itemId, mode: 'bind', expectedCmsHash: inspected.cmsHash,
    requestId: 'placebo-existing-draft-bind-01' };
  expect(await linkStagedSubmission('owner', input)).toMatchObject({ itemId, revision: 4, cmsWrites: 0 });
  const row = memory.rows.get(path);
  expect(row.stagedTarget).toMatchObject({ itemId, fieldDataHash: inspected.cmsHash });
  expect(row.contentHash).not.toBe('c'.repeat(64));
  expect(await linkStagedSubmission('owner', input)).toMatchObject({ replay: true, revision: 4 });
  expect(await linkStagedSubmission('owner', { submissionId: id, expectedRevision: 4, itemId })).toMatchObject({ revision: 4, exactDraftMatch: true });
  expect(state.patch).not.toHaveBeenCalled();
  await stageSubmissionMedia(row.stagedTarget, expected(), { minimumBodyImages: 0, preserveProvidedImages: true }, async () => {}, async () => {});
  expect(state.patch).toHaveBeenCalledTimes(1);
});
it('does not adopt a changed, published, ambiguous or unrelated CMS draft', async () => {
  delete state.fields.thumb;
  const page = { items: [{ id: itemId, cmsLocaleId: 'd'.repeat(24), isArchived: false, fieldData: { name: article.title, slug: article.slug } }] };
  state.read.mockImplementation(async (url: string) => url.includes('/items?') ? page
    : { id: itemId, cmsLocaleId: 'd'.repeat(24), isDraft: true, isArchived: false, lastPublished: null, fieldData: structuredClone(state.fields) });
  await expect(linkStagedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId, mode: 'bind',
    expectedCmsHash: '0'.repeat(64), requestId: 'staged-draft-stale-hash-01' })).rejects.toThrow('reconcile_confirmation_required');
  state.fields.content = '<p>Anden tekst.</p>';
  await expect(linkStagedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId })).rejects.toThrow('existing_article_mismatch');
  state.fields.content = article.content;
  page.items.push({ id: 'c'.repeat(24), cmsLocaleId: 'd'.repeat(24), isArchived: false, fieldData: { name: article.title, slug: 'andet' } });
  await expect(linkStagedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId })).rejects.toThrow('existing_article_mismatch');
  expect(memory.rows.get(path).stagedTarget).toBeUndefined();
  expect(state.patch).not.toHaveBeenCalled();
});
it('refuses to patch an adopted draft if it became live after binding', async () => {
  const original = target();
  await expect(stageSubmissionMedia(original, expected(), {}, async () => {}, async () => {}, true))
    .rejects.toThrow('existing_article_mismatch');
  expect(state.patch).not.toHaveBeenCalled();
});
it('updates only media on the same item, then adds body images without changing prose/SEO/rating/date', async () => {
  const original = target();
  const checkpoint = vi.fn(), lease = vi.fn();
  const first = await stageSubmissionMedia(original, expected(), { minimumBodyImages: 0, preserveProvidedImages: true }, checkpoint, lease);
  expect(first.itemId).toBe(itemId); expect(state.fields.stjerne).toBe(5);
  expect(Object.keys(state.patch.mock.calls[0][1]).sort()).toEqual(['foto-credit', 'mobile-image', 'thumb']);
  expect(checkpoint).toHaveBeenCalledBefore(state.patch);
  const next = target();
  await stageSubmissionMedia(next, { ...expected(), content: article.content + '<figure><img src="https://cdn.test/body.png" alt="Motiv"><figcaption>Kredit</figcaption></figure>' },
    { minimumBodyImages: 0, preserveProvidedImages: true }, checkpoint, lease);
  for (const key of ['name', 'slug', 'stjerne', 'seo-title', 'meta-description', 'publish-date', 'book-author', 'minutes-to-read', 'other']) expect(state.fields[key]).toEqual(original.fields[key]);
  expect(state.fields.content).toContain('width="1200" height="800"');
  expect(state.patch.mock.calls.map(call => call[0])).toEqual([itemId, itemId]);
});
it('refuses a race before patch and preserves the other editor’s work', async () => {
  await expect(stageSubmissionMedia(target(), expected(), {}, async () => {}, async () => { state.fields['seo-title'] = 'Anden redaktør'; })).rejects.toThrow('cms_conflict');
  expect(state.patch).not.toHaveBeenCalled();
});
it('shares the CMS item lease with SEO writers and releases it after a failed patch', async () => {
  const lease = await acquireCmsWriteLease(itemId, 'da');
  await expect(stageSubmissionMedia(target(), expected(), {}, async () => {}, async () => {})).rejects.toMatchObject({ code: 'write_busy' });
  expect(state.patch).not.toHaveBeenCalled();
  await lease.release();
  state.patch.mockRejectedValueOnce(Error('timeout'));
  await expect(stageSubmissionMedia(target(), expected(), {}, async () => {}, async () => {})).rejects.toThrow('timeout');
  const next = await acquireCmsWriteLease(itemId, 'da'); await next.release();
});
it('reads back after timeout without another patch and detects a changed asset', async () => {
  const baseline = target(), image = expected();
  state.patch.mockImplementationOnce(async (_id, patch) => { Object.assign(state.fields, patch); throw Error('timeout'); });
  await expect(stageSubmissionMedia(baseline, image, {}, async () => {}, async () => {})).rejects.toThrow('timeout');
  expect((await verifyStagedMedia(baseline, image, {})).itemId).toBe(itemId);
  expect(state.patch).toHaveBeenCalledTimes(1);
  await expect(verifyStagedMedia(baseline, { ...image, featuredImageHash: 'wrong' }, {})).rejects.toThrow('media_identity_changed');
});
it('retains the exact failed CMS checks before reporting a generic preparation failure', async () => {
  const proof = { publicationReady: false, draftConfirmed: true, fieldDataHash: 'proof', checks: [{ id: 'image:body-assets', ok: false }] };
  state.proof.mockResolvedValue(proof);
  const checkpoint = vi.fn();
  await expect(stageSubmissionMedia(target(), expected(), {}, checkpoint, async () => {})).rejects.toThrow('cms_checks_failed');
  expect(checkpoint.mock.calls.at(-1)![0]).toMatchObject({ target: { itemId }, proof });
  expect(state.patch).toHaveBeenCalledTimes(1);
});
it('cannot use a media update to change SEO, prose, slug or rating', () => {
  for (const edit of [{ rating: 6 }, { seoTitle: 'Ny SEO' }, { slug: 'ny' }, { content: '<p>Ny tekst</p>' }]) {
    expect(() => assertMediaOnlyUpdate(article, { ...article, ...edit })).toThrow('media_only_update');
  }
  expect(() => assertMediaOnlyUpdate(article, { ...article, featuredImage: 'https://cdn.test/new.png' })).not.toThrow();
});
it('prevents a duplicate creation by title/slug and fails closed on an incomplete listing', async () => {
  state.read.mockResolvedValueOnce({ items: [{ cmsLocaleId: 'd'.repeat(24), fieldData: { slug: article.slug } }] });
  await expect(assertSubmissionNotAlreadySaved(article)).rejects.toThrow('existing_article_requires_link');
  state.read.mockResolvedValueOnce({ unknown: true });
  await expect(assertSubmissionNotAlreadySaved(article)).rejects.toThrow('listing_unconfirmed');
  state.read.mockResolvedValueOnce({ items: [] });
  await expect(assertSubmissionNotAlreadySaved(article)).resolves.toBeUndefined();
  expect(state.patch).not.toHaveBeenCalled();
});
it('inspects and adopts newer live copy/body figure on the existing binding, preserving history and replaying once', async () => {
  await linkPublishedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId });
  const content = article.content + '\n<p>William og forfatterens baggrund.</p>\n<figure><img src="https://cdn.test/official.jpg" alt="Bogen"></figure>';
  state.fields.content = content; state.fields['book-title'] = 'I mellemtiden er vi ingen'; state.live = structuredClone(state.fields);
  const inspect = await linkPublishedSubmission('owner', { submissionId: id, expectedRevision: 4, itemId, mode: 'inspect' });
  expect(inspect).toMatchObject({ divergence: true, conflicts: [], proposedArticle: { content, bookTitle: 'I mellemtiden er vi ingen' } });
  expect(memory.rows.get(path).article.content).toBe(article.content);
  const refresh = { submissionId: id, expectedRevision: 4, itemId, mode: 'refresh', requestId: 'cms-refresh-regression-01', expectedCmsHash: cmsFieldHash(state.fields) };
  expect(await linkPublishedSubmission('owner', refresh)).toMatchObject({ revision: 5, cmsWrites: 0, publicationApproval: false });
  expect(memory.rows.get(path).article.content).toBe(content);
  expect(memory.rows.get(path).article.rating).toBe(5);
  expect(memory.rows.get(`${path}/versions/4`).article.content).toBe(article.content);
  expect(await linkPublishedSubmission('owner', refresh)).toMatchObject({ revision: 5, replay: true });
  expect(state.patch).not.toHaveBeenCalled();
});
it('rejects stale CMS hash, a different item, conflicting local edits and a reused request', async () => {
  await linkPublishedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId });
  const refresh = { submissionId: id, expectedRevision: 4, itemId, mode: 'refresh', requestId: 'cms-refresh-regression-02', expectedCmsHash: '0'.repeat(64) };
  await expect(linkPublishedSubmission('owner', refresh)).rejects.toThrow('cms_conflict');
  await expect(linkPublishedSubmission('owner', { ...refresh, itemId: 'c'.repeat(24) })).rejects.toThrow('identity_invalid');
  memory.rows.get(path).article = { ...article, content: '<p>Lokal redigering.</p>' };
  state.fields.content = '<p>Anden redaktørs redigering.</p>'; state.live = structuredClone(state.fields);
  expect(await linkPublishedSubmission('owner', { ...refresh, mode: 'inspect' })).toMatchObject({ conflicts: ['content'] });
  await expect(linkPublishedSubmission('owner', { ...refresh, expectedCmsHash: cmsFieldHash(state.fields) })).rejects.toThrow('cms_conflict');
  expect(state.patch).not.toHaveBeenCalled();
});
it('does not serialize or alter any existing body HTML for a cover-only change', async () => {
  const content = '<p>William &amp; vennerne.</p>\n<figure class="existing"><img src="https://cdn.test/official.jpg" alt="Bogen" /></figure>';
  state.fields.content = content; const original = target();
  await stageSubmissionMedia(original, { ...expected(), content }, {}, async () => {}, async () => {});
  expect(state.patch.mock.calls[0][1]).not.toHaveProperty('content');
  expect(state.fields.content).toBe(content);
});
it('rejects changed prose before, not after, the CMS mutation', async () => {
  await expect(stageSubmissionMedia(target(), { ...expected(), content: '<p>Uønsket omskrivning.</p>' }, {}, async () => {}, async () => {})).rejects.toThrow('media_only_update');
  expect(state.patch).not.toHaveBeenCalled();
});
it('reuses the exact existing bound cover bytes only; different files are never silently substituted', async () => {
  state.fields.thumb.fileId = 'f'.repeat(24);
  expect(await findBoundCoverByHash(target(), expected().featuredImageHash)).toEqual({ id: 'f'.repeat(24), url: state.fields.thumb.url });
  expect(await findBoundCoverByHash(target(), '0'.repeat(64))).toBeNull();
  const old = target(); state.fields.content = 'New copy';
  await expect(findBoundCoverByHash(old, expected().featuredImageHash)).rejects.toThrow('cms_conflict');
  expect(state.patch).not.toHaveBeenCalled();
});

function compressedPublication() {
  const cover = '1'.repeat(64), body = '2'.repeat(64), hash = '3'.repeat(64);
  const figure = (src: string) => `<figure data-apropos-asset="${body}"><img src="${src}" alt="Barnet"><figcaption>Illustration: Apropos</figcaption></figure>`;
  const local = { ...article, bookAuthor: 'Frederik Drescher Kluth', content: article.content + figure('https://cdn.test/original-body.png'),
    featuredImage: 'https://cdn.test/original.png', featuredImageAlt: 'Cover' };
  state.fields.content = article.content + figure('https://cdn.test/rehosted-body.png');
  state.fields.thumb = { url: 'https://cdn.test/rehosted.png', alt: 'Cover' };
  state.fields['mobile-image'] = state.fields.thumb;
  const bound = target(), row = memory.rows.get(path);
  Object.assign(row, { status: 'published', article: local, publishedTarget: bound, publication: {
    contentHash: row.contentHash, fieldDataHash: bound.fieldDataHash,
    receipt: { mediaIdentity: { cmsHash: bound.fieldDataHash, assets: [
      { assetId: cover, approvedHash: hash, published: [{ url: state.fields.thumb.url, hash }] },
      { assetId: body, approvedHash: hash, published: [{ url: 'https://cdn.test/rehosted-body.png', hash }] },
    ] } },
  } });
  for (const [assetId, url, role] of [[cover, local.featuredImage, 'cover'], [body, 'https://cdn.test/original-body.png', 'body']]) {
    memory.rows.set(`${path}/chatAssets/${assetId}`, { assetId, uid: 'owner', url, role, hash, originalHash: hash, status: 'attached',
      generationEvidence: { requiresPersonalSelection: true }, personalSelection: { uid: 'owner', originalHash: hash } });
  }
  state.fields.content = article.content + figure('https://cdn.test/optimized-body.webp');
  state.fields.thumb = { url: 'https://cdn.test/optimized.webp', alt: 'Cover' };
  state.fields['mobile-image'] = { url: 'https://cdn.test/optimized-mobile.webp', alt: 'Cover' };
  state.live = structuredClone(state.fields);
  const policy = 'published-compression-2026-10-09-v1', cmsLocaleId = 'd'.repeat(24);
  const receiptId = cmsFieldHash({ policy, itemId, cmsLocaleId, beforeHash: bound.fieldDataHash });
  memory.rows.set(`webflowArticleImageAutoOptimize/${receiptId}`, {
    policy, itemId, cmsLocaleId, status: 'complete', beforeHash: bound.fieldDataHash, before: bound.fields,
    afterHash: cmsFieldHash(state.fields), patch: { content: state.fields.content, thumb: state.fields.thumb, 'mobile-image': state.fields['mobile-image'] },
  });
  return { row, receiptId, cover, body, hash, bound };
}
it('adopts a fully receipted compression, retains original choices and locks derivatives without CMS writes', async () => {
  const fixture = compressedPublication(), args = { submissionId: id, expectedRevision: 3, itemId, mode: 'inspect' };
  const inspect = await linkPublishedSubmission('owner', args);
  expect(inspect).toMatchObject({ conflicts: [], verifiedCompressionReceipt: fixture.receiptId,
    proposedArticle: { content: state.fields.content, featuredImage: state.fields.thumb.url } });
  expect(memory.rows.get(path).revision).toBe(3);
  expect(await linkPublishedSubmission('owner', { ...args, mode: 'refresh', expectedCmsHash: cmsFieldHash(state.fields),
    requestId: 'compression-refresh-regression' })).toMatchObject({ revision: 4, cmsWrites: 0, publicationApproval: false });
  const row = memory.rows.get(path);
  expect(row.publishedTarget.mediaDerivatives).toHaveLength(3);
  expect(row.status).toBe('draft');
  const assets = [fixture.cover, fixture.body].map(assetId => memory.rows.get(`${path}/chatAssets/${assetId}`));
  expect(assets.every(a => a.originalHash === fixture.hash)).toBe(true);
  expect(projectImageSelection(row, assets)).toMatchObject({ required: false, items: [{ hash: fixture.hash }, { hash: fixture.hash }] });
  expect(memory.rows.get(`editorialProvidedAssets/${cmsFieldHash({ url: state.fields.thumb.url })}`)).toMatchObject({ derivativeReceipt: fixture.receiptId, preserveOriginal: true });
  expect(state.patch).not.toHaveBeenCalled();
});
it.each(['missing', 'write_started', 'wrong_hash', 'local_edit', 'bad_bytes', 'wrong_original'])('does not adopt unproven or conflicting compression: %s', async reason => {
  const f = compressedPublication(), receipt = memory.rows.get(`webflowArticleImageAutoOptimize/${f.receiptId}`);
  if (reason === 'missing') memory.rows.delete(`webflowArticleImageAutoOptimize/${f.receiptId}`);
  if (reason === 'write_started') receipt.status = 'write_started';
  if (reason === 'wrong_hash') receipt.afterHash = 'f'.repeat(64);
  if (reason === 'local_edit') f.row.article.content = '<p>Ændret lokalt</p>';
  if (reason === 'bad_bytes') state.compression.mockRejectedValueOnce(Error('image_optimization_asset_mismatch'));
  if (reason === 'wrong_original') f.row.publication.receipt.mediaIdentity.assets[0].approvedHash = 'f'.repeat(64);
  await expect(linkPublishedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId, mode: 'refresh',
    expectedCmsHash: cmsFieldHash(state.fields), requestId: 'compression-invalid-regression' })).rejects.toThrow();
  expect(memory.rows.get(path).revision).toBe(3);
  expect(state.patch).not.toHaveBeenCalled();
});
it('preserves distinct desktop/mobile derivatives when only adding a body image', async () => {
  const f = compressedPublication();
  await linkPublishedSubmission('owner', { submissionId: id, expectedRevision: 3, itemId, mode: 'refresh',
    expectedCmsHash: cmsFieldHash(state.fields), requestId: 'compression-body-add-regression' });
  const bound = memory.rows.get(path).publishedTarget, cover = structuredClone(state.fields.thumb), mobile = structuredClone(state.fields['mobile-image']);
  await stageSubmissionMedia(bound, { ...expected(), content: state.fields.content + '<figure><img src="https://cdn.test/cake.png" alt="Kage"></figure>',
    featuredImage: cover.url, featuredImageAlt: cover.alt }, {}, async () => {}, async () => {});
  expect(state.patch.mock.calls[0][1]).not.toHaveProperty('thumb');
  expect(state.patch.mock.calls[0][1]).not.toHaveProperty('mobile-image');
  expect(state.fields.thumb).toEqual(cover); expect(state.fields['mobile-image']).toEqual(mobile);
});
