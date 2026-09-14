import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => new Map<string, any>());
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: (name: string) => ({ doc: (id: string) => ({ key: `${name}/${id}`, get: async () => ({ data: () => structuredClone(db.get(`${name}/${id}`)) }) }),
    where: () => ({ limit: () => ({ query: true }) }) }),
  runTransaction: async (fn: any) => {
    const writes: (() => void)[] = [];
    const result = await fn({ get: async (ref: any) => {
      if (writes.length) throw new Error('read_after_write');
      return ref.query ? { docs: [{ id: 'run', data: () => structuredClone(db.get('livDailyArticles/run')) }] } :
        { data: () => structuredClone(db.get(ref.key)) };
    }, set: (ref: any, value: any) => writes.push(() => db.set(ref.key, structuredClone(value))),
    create: (ref: any, value: any) => { if (db.has(ref.key)) throw new Error('exists'); writes.push(() => db.set(ref.key, structuredClone(value))); } });
    writes.forEach(fn => fn()); return result;
  },
}) }));
const io = vi.hoisted(() => ({ read: vi.fn(), patch: vi.fn(), inspect: vi.fn(), assert: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: io.read, inspectLivCmsDraft: io.inspect }));
vi.mock('@/lib/webflow/locale-items', () => ({ patchArticleFieldDataForLocale: io.patch }));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({ acquireCmsWriteLease: async () => ({ assertOwned: io.assert, release: io.release }) }));
vi.mock('@/lib/seo-engine/opportunity-engine/locale', () => ({ cmsLocaleIdFor: () => 'da-locale' }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ articlesCollectionId: 'collection' }) }));
import { acceptLivShortening } from '@/lib/liv/accept-shortening';
import { cmsFieldHash as hash } from '@/lib/liv/cms-field-hash';
import { buildLivShorteningCandidate } from '@/lib/liv/shortening-candidate';
const words = (n: number) => Array(n).fill('kultur').join(' ');
const itemId = 'c'.repeat(24), actor = 'owner';
let input: any, cms: any, id: string;
beforeEach(() => {
  vi.resetAllMocks(); db.clear();
  const article: any = { title: 'Anmeldelse: Værket', content: `<p>${words(200)}</p><p>${words(200)}</p><p>${words(200)}</p>` };
  const expected = { ...article, slug: 'vaerket', wordCount: 600, readTime: 3 };
  cms = { id: itemId, cmsLocaleId: 'da-locale', isDraft: true, isArchived: false, lastPublished: null,
    fieldData: { name: article.title, slug: expected.slug, content: article.content, 'minutes-to-read': 3 } };
  const base = { itemId, requestId: 'shortening-test', targetWords: 500, expectedPayloadHash: hash(expected), expectedCmsHash: hash(cms.fieldData) };
  const edits = { bodyEdits: [{ index: 0, before: words(200), after: words(100) }] };
  const candidate = buildLivShorteningCandidate(article, 500, edits);
  input = { ...base, candidateHash: hash({ content: candidate.content }), reviewedFactsAndMeaning: true };
  id = hash({ itemId, requestId: base.requestId });
  db.set(`livShorteningProposals/${id}`, { article, input: base, inputHash: hash({ input: base, article }), status: 'preview',
    finishReason: 'stop', refusal: false, rawResponse: JSON.stringify(edits), proposal: { ...candidate, candidateHash: input.candidateHash } });
  db.set(`livShorteningReviews/${id}`, { identityHash: hash({ input, actorUid: actor }), input, actorUid: actor,
    kind: 'explicit-human-review', modelVerified: false, originalInputHash: hash({ input: base, article }), receipt: { candidateHash: input.candidateHash } });
  db.set(`livDelivery/item-${itemId}`, { expected, payloadHash: hash(expected) });
  db.set('livDelivery/manifest', { entries: [{ itemId, state: 'ready', scheduledDay: '2026-09-15', payloadHash: hash(expected) }], slots: {} });
  db.set('livDailyArticles/run', { webflowItemId: itemId, status: 'draft', articleCheckpoint: article,
    preparationProof: { expected, hash: hash(expected), editorialPassed: true, structurePassed: true }, originalFacts: { pass: true } });
  io.read.mockImplementation(async (path: string) => structuredClone(path === 'collections/collection' ?
    { fields: [{ slug: 'content' }, { slug: 'minutes-to-read' }] } : cms));
  io.patch.mockImplementation(async (_id, patch) => Object.assign(cms.fieldData, patch));
  io.inspect.mockImplementation(async () => ({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'body', ok: true }], fieldDataHash: hash(cms.fieldData) }));
});
it('stages once with immutable original audit and explicit human evidence, not a publication', async () => {
  const before = structuredClone(db.get('livDailyArticles/run'));
  const receipt = await acceptLivShortening(input, actor);
  expect(receipt).toMatchObject({ status: 'shortening_staged', wordCount: 500, publicationVerified: false });
  expect(await acceptLivShortening(input, actor)).toEqual(receipt);
  expect(io.patch).toHaveBeenCalledTimes(1);
  expect(db.get(`livShorteningAudits/${id}`).rows[0].row).toEqual(before);
  expect(db.get('livDailyArticles/run').preparationProof.editorialRevision).toMatchObject({ kind: 'explicit-human-review', modelVerified: false });
  expect(db.get('livDailyArticles/run').originalFacts).toEqual(before.originalFacts);
  expect(db.get('livDelivery/manifest').coverRevision).toBeUndefined();
});
it('requires the exact owner review before any CMS mutation', async () => {
  await expect(acceptLivShortening(input, 'other')).rejects.toThrow('review_required');
  expect(io.patch).not.toHaveBeenCalled();
});
it('rejects a missing review', async () => {
  db.delete(`livShorteningReviews/${id}`);
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('review_required');
  expect(io.patch).not.toHaveBeenCalled();
});
it('reconciles a lost successful patch response without a second write', async () => {
  io.patch.mockImplementationOnce(async (_id, patch) => { Object.assign(cms.fieldData, patch); throw new Error('lost response'); });
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('lost response');
  expect(db.get('livDelivery/manifest').coverRevision.id).toBe(id);
  expect(await acceptLivShortening(input, actor)).toMatchObject({ status: 'shortening_staged' });
  expect(io.patch).toHaveBeenCalledTimes(1);
});
it('does not blindly retry a write whose outcome is unknown', async () => {
  io.patch.mockRejectedValueOnce(new Error('timeout'));
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('timeout');
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('readback_pending');
  expect(io.patch).toHaveBeenCalledTimes(1);
});
it('retains the hold and old proof if full CMS validation fails', async () => {
  const old = structuredClone(db.get('livDailyArticles/run'));
  io.inspect.mockResolvedValueOnce({ draftConfirmed: true, publicationReady: false, checks: [{ id: 'image', ok: false }], fieldDataHash: '' });
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('inspection_failed');
  expect(db.get('livDailyArticles/run')).toEqual(old);
  expect(db.get('livDelivery/manifest').coverRevision.id).toBe(id);
});
it('rejects a day already occupied by another publication', async () => {
  db.get('livDelivery/manifest').slots['2026-09-15'] = { itemId: 'other' };
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('not_ready');
  expect(io.patch).not.toHaveBeenCalled();
});
it('does not overwrite a concurrently changed checkpoint', async () => {
  io.patch.mockImplementationOnce(async (_id, patch) => {
    Object.assign(cms.fieldData, patch); db.get('livDailyArticles/run').newerChange = true;
  });
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('conflict');
  expect(db.get('livDailyArticles/run').newerChange).toBe(true);
  expect(db.get('livDelivery/manifest').coverRevision.id).toBe(id);
});
it('does not write after losing the shared CMS lease', async () => {
  io.assert.mockRejectedValueOnce(new Error('lease lost'));
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('lease lost');
  expect(io.patch).not.toHaveBeenCalled();
});
it('rejects altered request identity even after completion', async () => {
  await acceptLivShortening(input, actor);
  await expect(acceptLivShortening({ ...input, candidateHash: '0'.repeat(64) }, actor)).rejects.toThrow('request_conflict');
  expect(io.patch).toHaveBeenCalledTimes(1);
});
it('refuses to finalize if the draft becomes published during validation', async () => {
  io.inspect.mockImplementationOnce(async () => {
    cms.isDraft = false; cms.lastPublished = '2026-09-14';
    return { draftConfirmed: true, publicationReady: true, checks: [{ id: 'body', ok: true }], fieldDataHash: hash(cms.fieldData) };
  });
  await expect(acceptLivShortening(input, actor)).rejects.toThrow('cms_changed');
  expect(db.get('livDailyArticles/run').preparationProof.editorialRevision).toBeUndefined();
});
