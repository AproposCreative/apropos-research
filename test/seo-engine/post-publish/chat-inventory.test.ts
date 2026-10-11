import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from '../../helpers/mcp-firestore';
const m = vi.hoisted(() => ({ db: null as any, read: vi.fn(), page: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => m.db }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));
vi.mock('@/lib/seo-engine/post-publish/cms', () => ({ readPublishedArticle: m.read, listPublishedArticlePage: m.page }));
vi.mock('@/lib/seo-engine/webflow-adapter', () => ({ getCmsSeoSlugs: () => ({ seoTitle: 'seo-title', metaDescription: 'meta-description' }) }));
import { claimSeoTasks } from '../../../lib/seo-engine/post-publish/chat';
import { enqueueQualityJob } from '../../../lib/seo-engine/post-publish/jobs';
const store = memoryFirestore();
const body = 'En fuld artikel om film, kultur og det levede liv. Teksten bevares i fuld længde, så redaktøren kan vurdere metadata mod alle afsnit og hele konklusionen.';
function article(id: string, locale: 'da' | 'en' = 'da') {
  return { snapshot: { itemId: id, locale, published: true, hasUnpublishedChanges: false, contentVersion: id,
    metadata: { seoTitle: `Film ${id}`, metaDescription: 'En beskrivelse af filmen og anmeldelsens vurdering.' } },
    live: { fieldData: { name: `Film ${id}`, content: `<p>${body}</p>` } }, publicUrl: 'https://www.aproposmagazine.com/articles/film' };
}
beforeEach(() => {
  vi.clearAllMocks(); store.clear(); m.db = store.db;
  m.read.mockImplementation(async (id, locale) => article(id, locale));
  m.page.mockResolvedValue({ items: [], total: 0 });
});
async function enqueue(id: string, locale: 'da' | 'en' = 'da') {
  const a = article(id, locale);
  return enqueueQualityJob({ source: 'webhook', snapshot: a.snapshot, mode: 'publication_quality',
    article: { editorialTitle: a.live.fieldData.name, body, metadata: a.snapshot.metadata, locale } });
}
it('two real claims share one traversal while replay performs none and full text is retained', async () => {
  await enqueue('a'.repeat(24)); await enqueue('b'.repeat(24));
  const first = await claimSeoTasks('owner', { requestId: 'inventory-batch-1' });
  expect(first.tasks).toHaveLength(2); expect(m.read).toHaveBeenCalledTimes(2); expect(m.page).toHaveBeenCalledOnce();
  for (const task of first.tasks) { expect(task.context!.article.body).toBe(body); expect(task.contextIncluded).toBe(true); }
  const replay = await claimSeoTasks('owner', { requestId: 'inventory-batch-1' });
  expect(replay.tasks).toEqual(first.tasks); expect(m.page).toHaveBeenCalledOnce();
});
it('claims in separate locales do not share the inventory', async () => {
  await enqueue('a'.repeat(24)); await enqueue('b'.repeat(24), 'en');
  expect((await claimSeoTasks('owner', { requestId: 'inventory-languages-1' })).tasks).toHaveLength(2);
  expect(m.page).toHaveBeenCalledTimes(2);
  expect(m.page).toHaveBeenCalledWith('da', 0, 100); expect(m.page).toHaveBeenCalledWith('en', 0, 100);
});
it('a failed traversal cannot admit a review with fabricated uniqueness', async () => {
  const queued = await enqueue('a'.repeat(24)); m.page.mockRejectedValue(Error('seo_webflow_list_403'));
  await expect(claimSeoTasks('owner', { requestId: 'inventory-failed-1' })).rejects.toThrow('seo_webflow_list_403');
  expect(store.rows.get(`seoPostPublishJobs/${queued.jobId}`).chatReview).toBeUndefined();
});
