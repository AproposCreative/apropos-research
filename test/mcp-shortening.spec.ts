import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const store = vi.hoisted(() => ({ db: null as any, rows: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => store.db }));
// Only storage and CMS boundaries are faked: proposal, baseline, checkpoint,
// personal review, exact patch, audit and acceptance all execute real code.
vi.mock('@/lib/liv/delivery-store', () => ({
  readDeliveryState: async () => structuredClone(store.rows.get('livDelivery/manifest')),
  readDeliveryPayload: async (id: string) => structuredClone(store.rows.get(`livDelivery/item-${id}`)?.expected),
}));
const io = vi.hoisted(() => ({ read: vi.fn(), patch: vi.fn(), inspect: vi.fn(), assert: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: io.read, inspectLivCmsDraft: io.inspect }));
vi.mock('@/lib/webflow/locale-items', () => ({ patchArticleFieldDataForLocale: io.patch }));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({ acquireCmsWriteLease: async () => ({ assertOwned: io.assert, release: io.release }) }));
vi.mock('@/lib/seo-engine/opportunity-engine/locale', () => ({ cmsLocaleIdFor: () => 'da-locale' }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ articlesCollectionId: 'collection' }) }));
import { getShorteningContext, previewExternalShortening, getExternalShortening, confirmExternalShortening, applyExternalShortening } from '@/lib/mcp/shortening';
import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
const words = (n: number) => Array(n).fill('kultur').join(' ');
const itemId = 'c'.repeat(24), actor = 'frederik';
const figure = (n: number) => `<figure><img src="https://images.example/${n}.webp" alt="Motiv ${n}"><figcaption>Kredit: Fotograf ${n}</figcaption></figure>`;
let input: any, cms: any, original: any, proposalId: string;
beforeEach(() => {
  vi.resetAllMocks(); const memory = memoryFirestore(); store.db = memory.db; store.rows = memory.rows;
  const article = { title: 'Anmeldelse: Værket', intro: 'En konkret vurdering.',
    content: `<p>${words(200)}</p>${figure(1)}<p>${words(200)}</p>${figure(2)}<p>${words(200)}</p>` };
  const expected = { ...article, slug: 'vaerket', wordCount: 600, readTime: 3 };
  cms = { id: itemId, cmsLocaleId: 'da-locale', isDraft: true, isArchived: false, lastPublished: null,
    fieldData: { name: article.title, slug: expected.slug, content: article.content, 'minutes-to-read': 3,
      'hero-image': { url: 'https://images.example/hero.webp' }, 'seo-title': 'Værket anmeldt', subtitle: 'Bevar mig' } };
  original = structuredClone(cms);
  input = { itemId, requestId: 'mcp-shortening-test', targetWords: 500,
    expectedPayloadHash: hash(expected), expectedCmsHash: hash(cms.fieldData),
    bodyEdits: [{ index: 0, before: words(200), after: words(100) }] };
  proposalId = hash({ itemId, requestId: input.requestId });
  store.rows.set(`livDelivery/item-${itemId}`, { expected, payloadHash: hash(expected) });
  store.rows.set('livDelivery/manifest', { entries: [{ itemId, state: 'ready', scheduledDay: '2026-10-06', payloadHash: hash(expected) }], slots: {} });
  store.rows.set('livDailyArticles/run', { webflowItemId: itemId, status: 'draft', articleCheckpoint: article,
    preparationProof: { expected, hash: hash(expected), editorialPassed: true, structurePassed: true }, originalFacts: { pass: true } });
  io.read.mockImplementation(async (path: string) => structuredClone(path === 'collections/collection' ?
    { fields: [{ slug: 'content' }, { slug: 'minutes-to-read' }] } : cms));
  io.patch.mockImplementation(async (_id, patch) => Object.assign(cms.fieldData, patch));
  io.inspect.mockImplementation(async () => ({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'body', ok: true }], fieldDataHash: hash(cms.fieldData) }));
});
const preview = () => withoutPaidAi(() => previewExternalShortening(actor, input));
const acceptInput = (p: any) => ({ proposalId: p.proposalId, candidateHash: p.candidateHash });
const confirm = (p: any) => withoutPaidAi(() => confirmExternalShortening(actor, { ...acceptInput(p), reviewedFactsAndMeaning: true }));
const apply = (p: any) => withoutPaidAi(() => applyExternalShortening(actor, acceptInput(p)));
it('reads canonical editable context without creating a proposal or approval', async () => {
  const before = hash(Object.fromEntries(store.rows));
  const context = await withoutPaidAi(() => getShorteningContext(itemId));
  expect(context).toMatchObject({ title: 'Anmeldelse: Værket', expectedPayloadHash: input.expectedPayloadHash, paidAiCalls: 0, publicationReady: false });
  expect(context.paragraphs[0]).toMatchObject({ index: 0, before: words(200), editable: true });
  expect(hash(Object.fromEntries(store.rows))).toBe(before); expect(io.patch).not.toHaveBeenCalled();
});
it('completes external preview → real review → staged save once, retaining media/SEO and original evidence', async () => {
  const oldRun = structuredClone(store.rows.get('livDailyArticles/run'));
  const p = await preview();
  expect(p).toMatchObject({ proposalId, beforeWords: 600, afterWords: 500, paidAiCalls: 0, source: 'chatgpt-supplied', publicationReady: false });
  const saved = store.rows.get(`livShorteningProposals/${proposalId}`);
  expect(saved).toMatchObject({ candidateSource: { kind: 'chatgpt-supplied', actorUid: actor, modelVerified: false }, providerAttempted: false });
  for (const key of ['rawResponse', 'model', 'finishReason', 'refusal']) expect(saved).not.toHaveProperty(key);
  expect(store.rows.has(`livShorteningReviews/${proposalId}`)).toBe(false);
  await expect(apply(p)).rejects.toThrow('review_required'); expect(io.patch).not.toHaveBeenCalled();
  expect(await getExternalShortening(actor, proposalId)).toMatchObject({ status: 'awaiting_review', reviewed: false, currentVersionMatches: true });
  expect(await confirm(p)).toMatchObject({ status: 'shortening_review_recorded', cmsChanged: false });
  expect(await getExternalShortening(actor, proposalId)).toMatchObject({ status: 'reviewed', reviewed: true });
  expect(io.patch).not.toHaveBeenCalled();
  const receipt = await apply(p); expect(receipt).toMatchObject({ status: 'shortening_staged', publicationVerified: false, wordCount: 500 });
  expect(await apply(p)).toEqual(receipt); expect(io.patch).toHaveBeenCalledTimes(1);
  expect(Object.keys(io.patch.mock.calls[0][1]).sort()).toEqual(['content', 'minutes-to-read']);
  expect({ ...cms.fieldData, content: original.fieldData.content }).toEqual(original.fieldData);
  expect(cms.fieldData.content).toContain(figure(1)); expect(cms.fieldData.content).toContain(figure(2)); expect(cms.isDraft).toBe(true);
  expect(store.rows.get(`livShorteningAudits/${proposalId}`).rows[0].row).toEqual(oldRun);
  expect(store.rows.get('livDailyArticles/run').preparationProof.editorialRevision).toMatchObject({ kind: 'explicit-human-review', modelVerified: false });
  expect(await getExternalShortening(actor, proposalId)).toMatchObject({ status: 'staged', receipt, publicationVerified: false });
});
it('reuses an identical concurrent proposal and refuses request-ID collisions without overwriting', async () => {
  const [p, second] = await Promise.all([preview(), preview()]); expect(p.proposalId).toBe(second.proposalId);
  cms.fieldData.subtitle = 'Concurrent change';
  expect(await preview()).toMatchObject({ proposalId, replayed: true });
  const before = hash(Object.fromEntries(store.rows));
  await expect(previewExternalShortening(actor, { ...input, targetWords: 501 })).rejects.toThrow('request_conflict');
  expect(hash(Object.fromEntries(store.rows))).toBe(before); expect(io.patch).not.toHaveBeenCalled();
});
it('does not overwrite a preexisting paid proposal with the same identity', async () => {
  store.rows.set(`livShorteningProposals/${proposalId}`, { rawResponse: 'saved paid work', status: 'failed' });
  await expect(preview()).rejects.toThrow('request_conflict');
  expect(store.rows.get(`livShorteningProposals/${proposalId}`).rawResponse).toBe('saved paid work');
});
it('rejects other accounts, forged candidate hashes and model/owner fields', async () => {
  const p = await preview();
  await expect(getExternalShortening('casper', proposalId)).rejects.toThrow('not_found');
  await expect(applyExternalShortening('milo', acceptInput(p))).rejects.toThrow('not_found');
  await expect(confirmExternalShortening('milo', { ...acceptInput(p), reviewedFactsAndMeaning: true })).rejects.toThrow('not_found');
  await expect(applyExternalShortening(actor, { ...acceptInput(p), candidateHash: '0'.repeat(64) })).rejects.toThrow('revision_conflict');
  await expect(previewExternalShortening(actor, { ...input, modelVerified: true })).rejects.toThrow();
  await expect(confirmExternalShortening(actor, { ...acceptInput(p), reviewedFactsAndMeaning: false })).rejects.toThrow();
  await expect(confirmExternalShortening(actor, { ...acceptInput(p), reviewedFactsAndMeaning: true, actorUid: 'milo' })).rejects.toThrow();
  expect(io.patch).not.toHaveBeenCalled();
});
it.each(['finishReason', 'rawResponse', 'model', 'refusal', 'submissionHash'])('rejects forged mixed provenance: %s', async key => {
  await preview(); store.rows.get(`livShorteningProposals/${proposalId}`)[key] = 'forged';
  await expect(getExternalShortening(actor, proposalId)).rejects.toThrow(); expect(io.patch).not.toHaveBeenCalled();
});
it.each(['missing-check', 'changed-cms', 'not-ready', 'published', 'selected', 'different-checkpoint'])('does not admit unsafe input: %s', async kind => {
  if (kind === 'missing-check') store.rows.get('livDailyArticles/run').preparationProof.editorialPassed = false;
  if (kind === 'changed-cms') cms.fieldData.subtitle = 'Changed';
  if (kind === 'not-ready') store.rows.get('livDelivery/manifest').entries[0].state = 'blocked';
  if (kind === 'published') cms.lastPublished = '2026-10-01T08:00:00Z';
  if (kind === 'selected') store.rows.get('livDelivery/manifest').slots['2026-10-06'] = { itemId };
  if (kind === 'different-checkpoint') store.rows.get('livDailyArticles/run').articleCheckpoint.title = 'Other';
  await expect(preview()).rejects.toThrow(); expect(store.rows.has(`livShorteningProposals/${proposalId}`)).toBe(false); expect(io.patch).not.toHaveBeenCalled();
});
it('keeps the saved proposal but refuses review after a later CMS change', async () => {
  const p = await preview(); cms.fieldData.subtitle = 'A newer edit';
  expect(await getExternalShortening(actor, proposalId)).toMatchObject({ currentVersionMatches: false, status: 'awaiting_review' });
  await expect(confirm(p)).rejects.toThrow('version_changed'); expect(io.patch).not.toHaveBeenCalled();
});
it('refuses a changed CMS version even after a valid human review', async () => {
  const p = await preview(); await confirm(p); cms.fieldData.subtitle = 'A newer edit';
  await expect(apply(p)).rejects.toThrow('checkpoint_changed'); expect(io.patch).not.toHaveBeenCalled();
});
it('reads back a successful timed-out write without buying or writing again', async () => {
  const p = await preview(); await confirm(p);
  io.patch.mockImplementationOnce(async (_id, patch) => { Object.assign(cms.fieldData, patch); throw Error('lost response'); });
  await expect(apply(p)).rejects.toThrow('lost response');
  expect(await getExternalShortening(actor, proposalId)).toMatchObject({ status: 'save_unconfirmed' });
  expect(await apply(p)).toMatchObject({ status: 'shortening_staged' }); expect(io.patch).toHaveBeenCalledTimes(1);
});
it('never retries an ambiguous CMS write or calls a failed inspection ready', async () => {
  const p = await preview(); await confirm(p); io.patch.mockRejectedValueOnce(Error('timeout'));
  await expect(apply(p)).rejects.toThrow('timeout'); await expect(apply(p)).rejects.toThrow('readback_pending');
  expect(io.patch).toHaveBeenCalledTimes(1); expect(await getExternalShortening(actor, proposalId)).toMatchObject({ status: 'save_unconfirmed' });
});
it('preserves controls and held work after an incomplete media check', async () => {
  const p = await preview(); await confirm(p);
  io.inspect.mockResolvedValueOnce({ draftConfirmed: true, publicationReady: false, checks: [{ id: 'image', ok: false }] });
  await expect(apply(p)).rejects.toThrow('inspection_failed');
  expect(store.rows.get('livDailyArticles/run').preparationProof.editorialRevision).toBeUndefined();
  expect(store.rows.get('livDelivery/manifest').coverRevision.id).toBe(proposalId);
});
it('fails closed on altered review and receipt evidence', async () => {
  const p = await preview(); await confirm(p);
  const review = store.rows.get(`livShorteningReviews/${proposalId}`); review.originalInputHash = 'wrong';
  await expect(getExternalShortening(actor, proposalId)).rejects.toThrow('review_conflict');
  review.originalInputHash = store.rows.get(`livShorteningProposals/${proposalId}`).inputHash;
  await apply(p); store.rows.get(`livShorteningAcceptances/${proposalId}`).receipt.revisionId = 'wrong';
  await expect(getExternalShortening(actor, proposalId)).rejects.toThrow('receipt_conflict');
});
it('rejects supplied HTML and non-shortening changes', async () => {
  await expect(previewExternalShortening(actor, { ...input, bodyEdits: [{ ...input.bodyEdits[0], after: '<script>alert(1)</script>' }] })).rejects.toThrow();
  await expect(previewExternalShortening(actor, { ...input, bodyEdits: [{ ...input.bodyEdits[0], after: words(201) }] })).rejects.toThrow();
  expect(store.rows.has(`livShorteningProposals/${proposalId}`)).toBe(false);
});
