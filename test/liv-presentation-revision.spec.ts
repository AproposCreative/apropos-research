import { beforeEach, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ rows: new Map<string, Record<string, any>>(), available: true }));
vi.mock('@/lib/firebase-admin', () => {
  const doc = (collection: string, id: string) => ({ id, key: `${collection}/${id}`,
    get: async () => ({ data: () => structuredClone(database.rows.get(`${collection}/${id}`)) }) });
  return { getAdminStorageBucket: vi.fn(), getAdminDb: () => database.available ? {
    collection: (name: string) => ({ doc: (id: string) => doc(name, id),
      where: (field: string, _op: string, value: unknown) => ({ limit: (limit: number) => ({ query: name, field, value, limit }) }) }),
    runTransaction: async (fn: any) => {
      const writes: Array<() => void> = [];
      const result = await fn({
        get: async (ref: any) => {
          if (writes.length) throw new Error('read_after_write');
          if (ref.query) return { docs: [...database.rows].filter(([key, row]) => key.startsWith(`${ref.query}/`) && row[ref.field] === ref.value)
            .slice(0, ref.limit).map(([key, row]) => ({ id: key.split('/')[1], data: () => structuredClone(row) })) };
          return { exists: database.rows.has(ref.key), data: () => structuredClone(database.rows.get(ref.key)) };
        },
        set: (ref: any, value: any) => writes.push(() => database.rows.set(ref.key, structuredClone(value))),
        create: (ref: any, value: any) => {
          if (database.rows.has(ref.key)) throw new Error('exists');
          writes.push(() => database.rows.set(ref.key, structuredClone(value)));
        },
      });
      writes.forEach(write => write()); return result;
    },
  } : null };
});
const io = vi.hoisted(() => ({ read: vi.fn(), patch: vi.fn(), inspect: vi.fn(), assertOwned: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: io.read, inspectLivCmsDraft: io.inspect }));
vi.mock('@/lib/webflow/locale-items', () => ({ patchArticleFieldDataForLocale: io.patch }));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({ acquireCmsWriteLease: async () => ({ assertOwned: io.assertOwned, release: io.release }) }));
vi.mock('@/lib/seo-engine/opportunity-engine/locale', () => ({ cmsLocaleIdFor: () => 'b'.repeat(24) }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({ articlesCollectionId: 'a'.repeat(24) }) }));
import { reviseLivPresentation, presentationRevisionInput } from '@/lib/liv/presentation-revision';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const id = 'c'.repeat(24);
let cms: any, input: any;
const manifest = () => database.rows.get('livDelivery/manifest')!;
const revision = () => [...database.rows].find(([k]) => k.startsWith('livPresentationRevisions/'))?.[1];
beforeEach(() => {
  vi.resetAllMocks(); database.rows.clear(); database.available = true;
  const expected = { title: 'Original article title', slug: 'unchanged-slug', content: '<p>Preserved body.</p>', seoTitle: 'Original SEO title', seoDescription: 'Original description' };
  cms = { id, cmsLocaleId: 'b'.repeat(24), isDraft: true, isArchived: false, lastPublished: null,
    fieldData: { name: expected.title, slug: expected.slug, content: expected.content, 'seo-title': expected.seoTitle,
      'meta-description': expected.seoDescription, thumb: { url: 'https://example.org/image.jpg' }, date: 'unchanged' } };
  const payloadHash = cmsFieldHash(expected);
  database.rows.set(`livDelivery/item-${id}`, { expected, payloadHash });
  database.rows.set('livDelivery/manifest', { entries: [{ itemId: id, title: expected.title, state: 'ready', scheduledDay: '2026-09-15', expiresDay: '2026-09-15', payloadHash }], slots: {} });
  database.rows.set('livDailyArticles/prepare-2026-09-15', { webflowItemId: id, status: 'draft', articleCheckpoint: { ...expected, intro: 'intro', rawResponse: 'saved paid response', selectedImage: { id: 'original', articleHash: 'old', url: 'original' } },
    preparationProof: { expected, hash: payloadHash, editorialPassed: true, structurePassed: true }, originalFactResult: { pass: true } });
  input = { itemId: id, requestId: 'presentation-test-01', reason: 'Explicit editorial correction grounded in unchanged article', expectedCmsHash: cmsFieldHash(cms.fieldData), expectedPayloadHash: payloadHash,
    patch: { title: 'Specific revised title', seoTitle: 'Specific revised SEO title', seoDescription: 'A specific revised description of the article.' } };
  io.read.mockImplementation(async () => structuredClone(cms));
  io.patch.mockImplementation(async (_id, fields) => Object.assign(cms.fieldData, fields));
  io.inspect.mockImplementation(async () => ({ draftConfirmed: true, publicationReady: true, checks: [{ ok: true }], fieldDataHash: cmsFieldHash(cms.fieldData) }));
});
it('updates CMS, checkpoint and delivery together while preserving body, date, assets, schedule and original checks', async () => {
  const before = structuredClone(cms.fieldData);
  const r = await reviseLivPresentation(input);
  expect(r.status).toBe('presentation_staged'); expect(r.publicationVerified).toBe(false);
  expect(io.patch).toHaveBeenCalledTimes(1);
  expect(cms.fieldData).toEqual({ ...before, name: input.patch.title, 'seo-title': input.patch.seoTitle, 'meta-description': input.patch.seoDescription });
  expect(manifest().entries[0]).toMatchObject({ title: input.patch.title, scheduledDay: '2026-09-15', expiresDay: '2026-09-15', state: 'ready' });
  const row=database.rows.get('livDailyArticles/prepare-2026-09-15')!;
  expect(row.articleCheckpoint.rawResponse).toBe('saved paid response'); expect(row.originalFactResult).toEqual({ pass: true });
  expect([...database.rows].find(([k]) => k.startsWith('livPresentationAudits/'))?.[1].cms.fieldData).toEqual(before);
  expect(manifest().coverRevision).toBeUndefined();
});
it('replays a completed request without writing again', async () => {
  const first=await reviseLivPresentation(input); expect(await reviseLivPresentation(input)).toEqual(first); expect(io.patch).toHaveBeenCalledTimes(1);
});
it('reconciles an uncertain successful write without repeating it', async () => {
  io.patch.mockImplementationOnce(async (_id, fields) => { Object.assign(cms.fieldData, fields); throw new Error('transport_lost'); });
  await expect(reviseLivPresentation(input)).rejects.toThrow('transport_lost');
  expect(manifest().coverRevision).toBeDefined();
  expect((await reviseLivPresentation(input)).status).toBe('presentation_staged'); expect(io.patch).toHaveBeenCalledTimes(1);
});
it('retains the hold and old active proof after failed full CMS inspection', async () => {
  io.inspect.mockResolvedValueOnce({ draftConfirmed: true, publicationReady: false, checks: [{ ok: false }] });
  await expect(reviseLivPresentation(input)).rejects.toThrow('inspection_failed');
  expect(manifest().coverRevision).toBeDefined(); expect(manifest().entries[0].title).toBe('Original article title'); expect(revision()?.patchStarted).toBe(true);
});
it.each(['selected','published','rejected'])('blocks %s queue state before a write', async state => {
  manifest().entries[0].state=state; await expect(reviseLivPresentation(input)).rejects.toThrow('not_ready'); expect(io.patch).not.toHaveBeenCalled();
});
it('blocks active publisher, mismatched CMS and unrelated fields', async () => {
  manifest().slots.today={itemId:id,state:'attempted'};await expect(reviseLivPresentation(input)).rejects.toThrow('not_ready');
  manifest().slots={};cms.fieldData.content+='editor changed';await expect(reviseLivPresentation(input)).rejects.toThrow('checkpoint_changed');
  expect(presentationRevisionInput.safeParse({...input,patch:{...input.patch,content:'replace body'}}).success).toBe(false);expect(io.patch).not.toHaveBeenCalled();
});
it('does not accept a failed original editorial proof',async()=>{
 database.rows.get('livDailyArticles/prepare-2026-09-15')!.preparationProof.editorialPassed=false;
 await expect(reviseLivPresentation(input)).rejects.toThrow('checkpoint_changed');expect(io.patch).not.toHaveBeenCalled();
});
