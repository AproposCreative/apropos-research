import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
const mock = vi.hoisted(() => ({ publish: vi.fn(), inspect: vi.fn(), candidates: vi.fn() }));
vi.mock('@/lib/articles/publish', () => ({ publishArticleDraftToWebflow: mock.publish }));
vi.mock('@/lib/articles/save-receipt', () => ({ inspectArticleSave: mock.inspect }));
vi.mock('@/lib/articles/find-staged-save', () => ({ stagedSaveCandidates: mock.candidates }));
import { saveWriterCmsDraft } from '@/lib/articles/writer-cms-save';
import type { ArticlePayload } from '@/lib/articles/article-payload';
const article = { title: 'Kultur', content: '<p>Bevar teksten.</p>', slug: 'kultur' } as ArticlePayload;
const id = '0123456789abcdef01234567';
const receipt = { saveState: 'draft', saveVerified: true, cmsLocaleId: id };
function database() {
  const rows = new Map<string, any>();
  const faults: { failPatch?: (patch: any) => boolean } = {};
  const ref = (path: string): any => ({ path, collection: (name: string) => ref(path + '/' + name), doc: (name: string) => ref(path + '/' + name),
    get: async () => ({ data: () => structuredClone(rows.get(path)) }) });
  let queue = Promise.resolve();
  const db = { collection: (name: string) => ref(name), runTransaction: (fn: any) => {
    const work = queue.then(() => fn({ get: (r: any) => r.get(), set: (r: any, data: any) => rows.set(r.path, structuredClone(data)),
      update: (r: any, data: any) => { if (faults.failPatch?.(data)) throw new Error('fixture checkpoint failure');
        return rows.set(r.path, { ...rows.get(r.path), ...structuredClone(data) }); } }));
    queue = work.catch(() => {}); return work;
  } } as unknown as Firestore;
  return { db, rows, faults };
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.candidates.mockResolvedValue([]);
  mock.inspect.mockResolvedValue(receipt);
  mock.publish.mockImplementation(async (input, hooks) => {
    await hooks.onBeforeSave(input); await hooks.onSaved(id);
    return { articleId: id, receipt };
  });
});
it('replays a completed request without a second write', async () => {
  const { db } = database();
  await saveWriterCmsDraft(db, 'alice', 'draft', article);
  const saved = await saveWriterCmsDraft(db, 'alice', 'draft', { ...article, webflowId: id });
  expect(saved).toMatchObject({ articleId: id, publicationVerified: false });
  expect(mock.publish).toHaveBeenCalledTimes(1);
  expect(mock.inspect).toHaveBeenCalledTimes(1);
});
it('reconciles a lost create response without issuing another create', async () => {
  const { db } = database();
  mock.publish.mockImplementationOnce(async (input, hooks) => { await hooks.onBeforeSave(input); throw new Error('lost after create'); });
  await expect(saveWriterCmsDraft(db, 'alice', 'draft', article)).rejects.toThrow('afventer');
  mock.candidates.mockResolvedValue([id]);
  expect(await saveWriterCmsDraft(db, 'alice', 'draft', article)).toMatchObject({ articleId: id });
  expect(mock.publish).toHaveBeenCalledTimes(1);
});
it.each([{found:[]}, {found:[id]}, {found:[id, '1123456789abcdef01234567']}])('does not adopt absent, pre-existing or ambiguous matches %j', async ({found}) => {
  const { db } = database();
  mock.candidates.mockResolvedValueOnce([id]);
  mock.publish.mockImplementationOnce(async (input, hooks) => { await hooks.onBeforeSave(input); throw new Error('lost'); });
  await expect(saveWriterCmsDraft(db, 'alice', 'draft', article)).rejects.toThrow();
  // For the third case both are new, so the result is truly ambiguous.
  if (found.length > 1) {
    // Simulate two entirely new candidates for the ambiguous case.
    await db.runTransaction(async tx => { tx.update(db.collection('writerWorkspaces').doc('alice').collection('cmsSaves').doc('draft'), { beforeIds: [] }); });
  }
  mock.candidates.mockResolvedValue(found);
  await expect(saveWriterCmsDraft(db, 'alice', 'draft', article)).rejects.toThrow('afventer');
  expect(mock.publish).toHaveBeenCalledTimes(1);
});
it('keeps the journal private to each user and draft', async () => {
  const { db, rows } = database();
  await saveWriterCmsDraft(db, 'alice', 'draft', article);
  await saveWriterCmsDraft(db, 'bob', 'draft', article);
  expect(rows.size).toBe(2); expect(mock.publish).toHaveBeenCalledTimes(2);
});
it('reconciles old work first and retains the ID for newer requested content', async () => {
  const { db } = database();
  mock.publish.mockImplementationOnce(async (input, hooks) => { await hooks.onBeforeSave(input); throw new Error('lost'); });
  await expect(saveWriterCmsDraft(db, 'alice', 'draft', article)).rejects.toThrow();
  mock.candidates.mockResolvedValue([id]);
  const newer = { ...article, content: '<p>Ny tekst.</p>' };
  await expect(saveWriterCmsDraft(db, 'alice', 'draft', newer)).rejects.toMatchObject({ articleId: id });
  await saveWriterCmsDraft(db, 'alice', 'draft', newer);
  expect(mock.publish.mock.calls[1][0]).toMatchObject({ webflowId: id, content: newer.content });
});
it('refuses an overlapping request while the first operation is in flight', async () => {
  const { db } = database();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  mock.publish.mockImplementationOnce(async (input, hooks) => { await hooks.onBeforeSave(input); entered(); await held; await hooks.onSaved(id); return { articleId: id, receipt }; });
  const first = saveWriterCmsDraft(db, 'alice', 'draft', article);
  await ready;
  await expect(saveWriterCmsDraft(db, 'alice', 'draft', article)).rejects.toThrow('afventer');
  release(); await first; expect(mock.publish).toHaveBeenCalledTimes(1);
});
it('does not reach the external write unless the attempted checkpoint persists', async () => {
  const { db, faults } = database();
  const externalWrite = vi.fn();
  faults.failPatch = patch => patch.phase === 'attempted';
  mock.publish.mockImplementation(async (input, hooks) => {
    await hooks.onBeforeSave(input); externalWrite(); await hooks.onSaved(id); return { articleId: id, receipt };
  });
  await expect(saveWriterCmsDraft(db, 'alice', 'draft', article)).rejects.toThrow();
  expect(externalWrite).not.toHaveBeenCalled();
  faults.failPatch = undefined;
  await saveWriterCmsDraft(db, 'alice', 'draft', article);
  expect(externalWrite).toHaveBeenCalledTimes(1);
});
it('recovers without rewriting when persisting the returned CMS ID fails', async () => {
  const { db, faults } = database();
  const externalWrite = vi.fn();
  faults.failPatch = patch => !!patch.articleId;
  mock.publish.mockImplementation(async (input, hooks) => {
    await hooks.onBeforeSave(input); externalWrite(); await hooks.onSaved(id); return { articleId: id, receipt };
  });
  await expect(saveWriterCmsDraft(db, 'alice', 'draft', article)).rejects.toThrow();
  faults.failPatch = undefined; mock.candidates.mockResolvedValue([id]);
  expect(await saveWriterCmsDraft(db, 'alice', 'draft', article)).toMatchObject({ articleId: id });
  expect(externalWrite).toHaveBeenCalledTimes(1);
});
it('retains previous operation history when a newer revision is saved', async () => {
  const { db, rows } = database();
  await saveWriterCmsDraft(db, 'alice', 'draft', article);
  await saveWriterCmsDraft(db, 'alice', 'draft', { ...article, content: '<p>Næste revision.</p>' });
  const history = [...rows.entries()].filter(([path]) => path.includes('/history/'));
  expect(history).toHaveLength(1);
  expect(history[0][1]).toMatchObject({ articleId: id, phase: 'saved', expected: { content: article.content } });
});
