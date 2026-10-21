import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from '../../helpers/mcp-firestore';
const m = vi.hoisted(() => ({ db: null as any, read: vi.fn(), apply: vi.fn(), reconcile: vi.fn(), duplicates: vi.fn(), reviewDuplicates: vi.fn(), paid: vi.fn(),
  google: vi.fn(),
  current: null as any, lostResponse: false }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => m.db }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: m.paid }));
vi.mock('@/lib/seo-engine/post-publish/google-context', () => ({ readArticleGoogleContext: m.google }));
vi.mock('@/lib/seo-engine/post-publish/cms', () => ({ readPublishedArticle: m.read, applyPublishedMetadata: m.apply, reconcilePublishedMetadata: m.reconcile }));
vi.mock('@/lib/seo-engine/post-publish/uniqueness', () => ({ checkLiveMetadataDuplicates: m.duplicates, createMetadataReviewInventory: () => m.reviewDuplicates }));
vi.mock('@/lib/seo-engine/cms-write-lease', () => ({ acquireCmsWriteLease: async () => ({ assertOwned: async () => {}, release: async () => {} }) }));
import { claimSeoTasks, getSeoTask, saveSeoReview, applySeoReview, activateChatSeo } from '../../../lib/seo-engine/post-publish/chat';
import { enqueueQualityJob, claimQualityJob } from '../../../lib/seo-engine/post-publish/jobs';
import { assertLegacySeoProcessor, seoStateId } from '../../../lib/seo-engine/post-publish/processor';
import { assertPaidAiAllowed } from '../../../lib/ai/no-paid-calls';
import { reviewKey } from '../../../lib/seo-engine/post-publish/policy';
const store = memoryFirestore(), itemId = 'a'.repeat(24), uid = 'owner';
const body = 'Filmen følger en familie i København og skildrer deres hverdag med varme og humor. Anmeldelsen fremhæver især skuespillernes præcise samspil og kritiserer en forudsigelig slutning.';
const quote = 'Filmen følger en familie i København';
const stateKey = `seoPostPublishArticles/${seoStateId(itemId, 'da')}`;
beforeEach(() => {
  vi.clearAllMocks(); store.clear(); m.db = store.db; m.lostResponse = false;
  m.google.mockResolvedValue({ checkedAt: '2026-10-14T07:00:00Z', gsc: { status: 'no_rows', metrics: null }, ga4: { status: 'available', metrics: { screenPageViews: 12 } } });
  m.current = { snapshot: { itemId, locale: 'da', published: true, hasUnpublishedChanges: false, contentVersion: 'body-images-rating-hash',
    metadata: { seoTitle: 'Familien: Anmeldelse', metaDescription: 'Læs vores anmeldelse af filmen her på siden og se hvad vi synes.' } },
    live: { fieldData: { name: 'Familien: Anmeldelse', content: `<p>${body}</p>`, stjerne: 4 } }, publicUrl: 'https://www.aproposmagazine.com/articles/familien' };
  m.read.mockImplementation(async () => structuredClone(m.current));
  m.duplicates.mockResolvedValue({ seoTitle: [], metaDescription: [] });
  m.reviewDuplicates.mockResolvedValue({ seoTitle: [], metaDescription: [] });
  m.apply.mockImplementation(async args => {
    await args.beforeWrite(m.current.snapshot);
    m.current.snapshot.metadata = { ...m.current.snapshot.metadata, ...args.patch };
    if (m.lostResponse) { m.lostResponse = false; throw Error('timeout'); }
    return m.reconcile(args.analyzed, args.patch);
  });
  m.reconcile.mockImplementation(async (before, patch) => {
    if (m.current.snapshot.contentVersion !== before.contentVersion || JSON.stringify(m.current.snapshot.metadata) !== JSON.stringify({ ...before.metadata, ...patch })) throw Error('seo_cms_reconciliation_required');
    return { after: structuredClone(m.current.snapshot), publicReceipt: { url: m.current.publicUrl, checkedAt: new Date().toISOString() } };
  });
});
async function claim() {
  return (await claimSeoTasks(uid, { requestId: 'manual-review-1', articleId: itemId, limit: 1 })).tasks[0];
}
function proposal(task: Awaited<ReturnType<typeof getSeoTask>>, improve = true) {
  return { taskId: task.taskId, expectedContextHash: task.contextHash, requestId: 'proposal-stable-1', readFullArticle: true,
    assessments: [ { field: 'seoTitle', verdict: 'keep', reason: 'Den nævner værket og anmeldelsesintentionen præcist.', articleQuotes: [quote] },
      { field: 'metaDescription', verdict: improve ? 'improve' : 'keep', reason: improve ? 'Den generiske beskrivelse erstattes af konkrete pointer fra anmeldelsen.' : 'Beskrivelsen er præcis og har ingen dokumenteret fejl.',
        ...(improve ? { proposedValue: 'Familien skildrer hverdagen i København med varme og humor. Læs anmeldelsen af samspillet og den forudsigelige slutning.' } : {}), articleQuotes: [quote] } ] };
}
const applyInput = (task: Awaited<ReturnType<typeof getSeoTask>>) => ({ taskId: task.taskId, proposalHash: task.proposal!.hash,
  recheck: { readFullArticle: true, supported: true, betterOrKept: true, reason: 'Genlæst mod hele anmeldelsen: sted, tema og kritik er dækket, uden nye fakta.' } });
it('reserves the SAME queue item durably and replays a lost claim response without API work', async () => {
  const [a, b] = await Promise.all([claim(), claim()]);
  expect(a.taskId).toBe(b.taskId); expect(a.contextHash).toBe(b.contextHash);
  expect(a.context!.article.body).toBe(body); expect(a.context!.google).toEqual({ evidence: null, context: null, articleData: expect.objectContaining({ gsc: { status: 'no_rows', metrics: null } }) });
  expect(await claimQualityJob(a.taskId)).toBeNull();
  await expect(assertLegacySeoProcessor(itemId, 'da')).rejects.toThrow('seo_chatgpt_article_reserved');
  expect(m.paid).not.toHaveBeenCalled();
});
it('applies only the saved metadata patch, preserves content identity, verifies public result and is idempotent', async () => {
  const task = await claim(), p = proposal(task);
  const saved = await saveSeoReview(uid, p);
  expect(saved.proposal!.technicalDecision.reason).toBe('eligible_pending_chatgpt_recheck');
  expect(saved.serverFactCheckPerformed).toBe(false); expect(m.apply).not.toHaveBeenCalled();
  expect((await saveSeoReview(uid, p)).proposal!.hash).toBe(saved.proposal!.hash);
  const result = await applySeoReview(uid, applyInput(saved));
  expect(result.status).toBe('applied'); expect(result.publicReceipt).toBeTruthy();
  expect(m.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ patch: { metaDescription: p.assessments[1].proposedValue } }));
  expect(result.after!.contentVersion).toBe('body-images-rating-hash'); expect(result.after!.metadata.seoTitle).toBe(task.context!.snapshot.metadata.seoTitle);
  expect(await applySeoReview(uid, applyInput(saved))).toEqual(result); expect(m.apply).toHaveBeenCalledOnce();
  expect(store.rows.get(stateKey).chatJobId).toBeNull(); expect(m.paid).not.toHaveBeenCalled();
});
it('keeps both fields with public readback and no CMS write', async () => {
  const task = await claim(), saved = await saveSeoReview(uid, proposal(task, false));
  const result = await applySeoReview(uid, applyInput(saved));
  expect(result.status).toBe('kept'); expect(result.publicReceipt).toBeTruthy();
  expect(m.apply).not.toHaveBeenCalled(); expect(m.paid).not.toHaveBeenCalled();
});
it('after a transport timeout only reconciles the saved intent, never repeats PATCH', async () => {
  const saved = await saveSeoReview(uid, proposal(await claim())); m.lostResponse = true;
  const first = await applySeoReview(uid, applyInput(saved)); expect(first.status).toBe('verify_pending');
  expect(store.rows.get(stateKey).pendingJobId).toBe(first.taskId);
  const next = await applySeoReview(uid, applyInput(saved)); expect(next.status).toBe('applied');
  expect(m.apply).toHaveBeenCalledOnce(); expect(store.rows.get(stateKey).pendingJobId).toBeNull();
});
it.each(['content', 'metadata', 'staged'])('rejects a concurrent %s change and does not overwrite it', async change => {
  const saved = await saveSeoReview(uid, proposal(await claim()));
  if (change === 'content') m.current.snapshot.contentVersion = 'edited-body';
  if (change === 'metadata') m.current.snapshot.metadata.seoTitle = 'Redaktionens nye titel';
  if (change === 'staged') m.current.snapshot.hasUnpublishedChanges = true;
  expect((await applySeoReview(uid, applyInput(saved))).status).toBe('stale'); expect(m.apply).not.toHaveBeenCalled();
});
it('rejects locked fields both before proposal and just before applying', async () => {
  const task = await claim(); store.rows.set(stateKey, { ...store.rows.get(stateKey), lockedFields: ['metaDescription'] });
  await expect(saveSeoReview(uid, proposal(task))).rejects.toThrow('seo_chat_field_locked');
  store.rows.get(stateKey).lockedFields = [];
  const saved = await saveSeoReview(uid, proposal(task)); store.rows.get(stateKey).lockedFields = ['metaDescription'];
  const result = await applySeoReview(uid, applyInput(saved)); expect(result.reason).toBe('editorial_lock_changed'); expect(m.apply).not.toHaveBeenCalled();
});
it('refuses forged context, quotes, another owner, changed request and changed proposal', async () => {
  const task = await claim();
  await expect(getSeoTask('someone-else', task.taskId)).rejects.toThrow('seo_chat_task_not_found');
  await expect(claimSeoTasks(uid, { requestId: 'manual-review-1', articleId: itemId, limit: 2 })).rejects.toThrow('seo_chat_request_changed');
  await expect(saveSeoReview(uid, { ...proposal(task), expectedContextHash: 'f'.repeat(64) })).rejects.toThrow('seo_chat_context_changed');
  const forged = proposal(task); forged.assessments[0].articleQuotes = ['En opdigtet kilde som ikke findes i artiklen.'];
  await expect(saveSeoReview(uid, forged)).rejects.toThrow('seo_chat_quote_not_in_article');
  await saveSeoReview(uid, proposal(task));
  await expect(saveSeoReview(uid, proposal(task, false))).rejects.toThrow('seo_chat_proposal_already_saved');
});
it('preserves personally approved publication metadata and refuses premature processor cutover', async () => {
  store.rows.set(stateKey, { publicationPreservedKey: reviewKey(m.current.snapshot) });
  expect((await claimSeoTasks(uid, { requestId: 'preserved-1', articleId: itemId })).tasks).toHaveLength(0);
  await expect(activateChatSeo(uid, { appliedTaskId: 'f'.repeat(64), keptTaskId: 'e'.repeat(64) })).rejects.toThrow('seo_chat_task_not_found');
});
it('closes a stale performance job without inventing missing data or acquiring a model', async () => {
  const job = await enqueueQualityJob({ source: 'performance', manualRequested: true, mode: 'performance', snapshot: m.current.snapshot,
    article: { editorialTitle: 'Familien', body, locale: 'da', metadata: m.current.snapshot.metadata } });
  const result = await claimSeoTasks(uid, { requestId: 'missing-google-1' });
  expect(result.tasks).toHaveLength(0); expect(result.skipped[0].reason).toBe('insufficient_performance_evidence');
  expect(store.rows.get(`seoPostPublishJobs/${job.jobId}`).status).toBe('stale'); expect(m.paid).not.toHaveBeenCalled();
});
it('the no-paid boundary is effective inside nested operations, not just an output label', async () => {
  m.read.mockImplementationOnce(async () => { assertPaidAiAllowed(); return m.current; });
  await expect(claim()).rejects.toThrow('mcp_paid_call_requires_separate_approval');
  expect(m.apply).not.toHaveBeenCalled();
});
it('global processor switch prevents new API claims without erasing queued jobs', async () => {
  const result = await enqueueQualityJob({ source: 'webhook', mode: 'publication_quality', snapshot: m.current.snapshot,
    article: { editorialTitle: 'Familien', body, locale: 'da', metadata: m.current.snapshot.metadata } });
  store.rows.set('seoPostPublishControl/processor', { mode: 'chatgpt-first' });
  expect(await claimQualityJob(result.jobId!)).toBeNull();
  await expect(assertLegacySeoProcessor()).rejects.toThrow('seo_chatgpt_processor_required');
  expect(store.rows.get(`seoPostPublishJobs/${result.jobId}`).attempt).toBe(0);
});
it('enforces a separate maximum of two new performance claims even across different batches', async () => {
  m.read.mockImplementation(async (id: string) => ({ ...structuredClone(m.current), snapshot: { ...structuredClone(m.current.snapshot), itemId: id } }));
  for (const id of ['a', 'b', 'c'].map(c => c.repeat(24))) {
    await enqueueQualityJob({ source: 'performance', manualRequested: true, mode: 'performance', snapshot: { ...m.current.snapshot, itemId: id },
      article: { editorialTitle: 'Familien', body, locale: 'da', metadata: m.current.snapshot.metadata },
      evidence: { fetchedAt: new Date().toISOString(), comparable: true, currentDays: 28, previousDays: 28, currentImpressions: 500, previousImpressions: 400 } });
  }
  const first = await claimSeoTasks(uid, { requestId: 'performance-limit-1' }); expect(first.tasks).toHaveLength(2);
  for (const task of first.tasks) store.rows.get(`seoPostPublishJobs/${task.taskId}`).status = 'kept';
  const next = await claimSeoTasks(uid, { requestId: 'performance-limit-2' });
  expect(next.tasks).toHaveLength(0); expect(next.skipped).toContainEqual(expect.objectContaining({ reason: 'daily_performance_limit' }));
});
it('does not call a rejected ChatGPT recheck a successful server verification', async () => {
  const saved = await saveSeoReview(uid, proposal(await claim())); const input = applyInput(saved); input.recheck.supported = false;
  const result = await applySeoReview(uid, input); expect(result.status).toBe('needs_editor');
  expect(result.publicReceipt).toBeNull(); expect(result.serverFactCheckPerformed).toBe(false); expect(m.apply).not.toHaveBeenCalled();
});
it('returns compact save/apply/status receipts while preserving recoverable full context and ownership', async () => {
  const task = await claim();
  expect(task.contextIncluded).toBe(true);
  const saved = await saveSeoReview(uid, proposal(task));
  expect(saved.contextIncluded).toBe(false); expect(saved.context).toBeNull();
  expect(saved.article.itemId).toBe(itemId); expect(saved.proposal!.before).toEqual(task.context!.snapshot.metadata);
  const status = await getSeoTask(uid, task.taskId, task.contextHash);
  expect(status).toEqual(saved);
  expect((await getSeoTask(uid, task.taskId)).context).toEqual(task.context);
  const changedHash = await getSeoTask(uid, task.taskId, 'f'.repeat(64));
  expect(changedHash.contextIncluded).toBe(true); expect(changedHash.context).toEqual(task.context);
  await expect(getSeoTask('other', task.taskId, task.contextHash)).rejects.toThrow('seo_chat_task_not_found');
  await expect(getSeoTask(uid, task.taskId, 'invalid')).rejects.toThrow();
  const result = await applySeoReview(uid, applyInput(saved));
  expect(result.context).toBeNull(); expect(result.publicReceipt).toBeTruthy();
  expect(result.recheck).toEqual(applyInput(saved).recheck);
  expect((await getSeoTask(uid, task.taskId)).context).toEqual(task.context);
});
it('never uses the shared review inventory for the final write check', async () => {
  const saved = await saveSeoReview(uid, proposal(await claim()));
  expect(m.reviewDuplicates).toHaveBeenCalledOnce(); expect(m.duplicates).not.toHaveBeenCalled();
  m.duplicates.mockResolvedValueOnce({ seoTitle: [], metaDescription: ['new-concurrent-article'] });
  const result = await applySeoReview(uid, applyInput(saved));
  expect(m.duplicates).toHaveBeenCalledOnce(); expect(m.reviewDuplicates).toHaveBeenCalledOnce();
  expect(result.reason).toBe('seo_metadata_duplicate'); expect(m.apply).not.toHaveBeenCalled();
});
it('compact status returns current locks without changing the saved article context', async () => {
  const task = await claim();
  store.rows.get(stateKey).lockedFields = ['seoTitle'];
  const result = await getSeoTask(uid, task.taskId, task.contextHash);
  expect(result.context).toBeNull(); expect(result.lockedFields).toEqual(['seoTitle']);
  expect(result.contextHash).toBe(task.contextHash);
});
it('replays a completed claim and polls status without collecting Google data again', async () => {
  const task = await claim();
  expect(m.google).toHaveBeenCalledOnce();
  await claim(); await getSeoTask(uid, task.taskId);
  expect(m.google).toHaveBeenCalledOnce();
});
function seedBatchCandidates(kinds: Array<'eligible' | 'changed' | 'archive'>) {
  const fresh = new Map<string, any>();
  const ids = kinds.map((kind, index) => {
    const id = (index + 1).toString(16).padStart(64, '0');
    const articleId = (index + 1).toString(16).padStart(24, '0');
    const current = structuredClone(m.current);
    current.snapshot.itemId = articleId;
    fresh.set(articleId, current);
    store.rows.set(`seoPostPublishJobs/${id}`, { id, status: 'queued',
      source: kind === 'archive' ? 'recovery' : 'webhook', mode: 'publication_quality',
      createdAt: new Date(index * 1000).toISOString(), updatedAt: new Date().toISOString(),
      ...(kind === 'archive' ? { discoveredPublishedAt: '2000-01-01T00:00:00Z' } : {}),
      snapshot: { ...current.snapshot, ...(kind === 'changed' ? { contentVersion: 'outdated-version' } : {}) },
      article: { editorialTitle: 'Familien', body, locale: 'da', metadata: current.snapshot.metadata },
    });
    return id;
  });
  m.read.mockImplementation(async (articleId: string) => structuredClone(fresh.get(articleId)));
  return { ids, fresh };
}
it('finishes eleven candidates in the same three-call batch without reviewing a kept task twice', async () => {
  const seeded = seedBatchCandidates(['eligible', ...Array<'archive'>(10).fill('archive')]);
  const input = { requestId: 'bounded-existing-batch', limit: 2 };
  const first = await claimSeoTasks(uid, input);
  expect(first.tasks).toHaveLength(1); expect(first.skipped).toHaveLength(3); expect(first.hasMore).toBe(true);
  m.current = structuredClone(seeded.fresh.values().next().value);
  const kept = await applySeoReview(uid, applyInput(await saveSeoReview(uid, proposal(first.tasks[0], false))));
  const second = await claimSeoTasks(uid, input), third = await claimSeoTasks(uid, input);
  expect([first.batchId, second.batchId, third.batchId]).toEqual(Array(3).fill(first.batchId));
  expect(second.skipped).toHaveLength(4); expect(second.hasMore).toBe(true);
  expect(third.skipped).toHaveLength(3); expect(third.hasMore).toBe(false);
  expect(third.tasks).toHaveLength(1); expect(third.tasks[0].status).toBe('kept');
  expect(third.tasks[0].publicReceipt).toEqual(kept.publicReceipt);
  const batch = store.rows.get(`seoPostPublishControl/${first.batchId}`);
  expect(batch.checked).toHaveLength(11); expect(new Set(batch.checked).size).toBe(11);
  expect(batch.taskIds).toEqual([seeded.ids[0]]);
  expect(m.google).toHaveBeenCalledOnce(); expect(m.reconcile).toHaveBeenCalledOnce();
  expect(m.apply).not.toHaveBeenCalled(); expect(m.paid).not.toHaveBeenCalled();
});
it('continues past two empty skipped pages to a later eligible task using the identical request', async () => {
  const seeded = seedBatchCandidates([...Array<'changed'>(8).fill('changed'), 'eligible']);
  const input = { requestId: 'bounded-skip-continuation', limit: 2 };
  const first = await claimSeoTasks(uid, input), second = await claimSeoTasks(uid, input);
  for (const result of [first, second]) {
    expect(result.tasks).toHaveLength(0); expect(result.skipped).toHaveLength(4); expect(result.hasMore).toBe(true);
    expect(result.skipped.every(skip => skip.reason === 'article_changed')).toBe(true);
  }
  await expect(getSeoTask(uid, first.skipped[0].taskId)).rejects.toThrow('seo_chat_task_not_found');
  const third = await claimSeoTasks(uid, input);
  expect(second.batchId).toBe(first.batchId); expect(third.batchId).toBe(first.batchId);
  expect(third.tasks.map(task => task.taskId)).toEqual([seeded.ids[8]]); expect(third.hasMore).toBe(false);
  expect(store.rows.get(`seoPostPublishControl/${first.batchId}`).checked).toHaveLength(9);
  expect(m.google).toHaveBeenCalledOnce(); expect(m.apply).not.toHaveBeenCalled(); expect(m.paid).not.toHaveBeenCalled();
});
it('leaves thirteen skipped candidates bounded and incomplete after the schedule cap of three calls', async () => {
  const seeded = seedBatchCandidates(Array<'changed'>(13).fill('changed'));
  const input = { requestId: 'bounded-cap-not-completed', limit: 2 };
  const results = [];
  // The caller owns the three-call cap; the server owns four inspections per call.
  for (let call = 0; call < 3; call++) results.push(await claimSeoTasks(uid, input));
  expect(new Set(results.map(result => result.batchId)).size).toBe(1);
  for (const result of results) {
    expect(result.tasks).toHaveLength(0); expect(result.skipped).toHaveLength(4); expect(result.hasMore).toBe(true);
  }
  const batch = store.rows.get(`seoPostPublishControl/${results[0].batchId}`);
  expect(batch.checked).toHaveLength(12); expect(new Set(batch.checked).size).toBe(12);
  expect(batch.candidateIds).toHaveLength(13); expect(batch.taskIds).toEqual([]);
  expect(store.rows.get(`seoPostPublishJobs/${seeded.ids[12]}`).status).toBe('queued');
  expect(m.google).not.toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled(); expect(m.paid).not.toHaveBeenCalled();
});
it('explicit Google refresh is owner-scoped and never changes an approved context, proposal or receipt', async () => {
  const saved = await saveSeoReview(uid, proposal(await claim(), false));
  await applySeoReview(uid, applyInput(saved));
  const before = structuredClone([...store.rows]);
  m.google.mockClear();
  await expect(getSeoTask('other', saved.taskId, undefined, true)).rejects.toThrow('seo_chat_task_not_found');
  expect(m.google).not.toHaveBeenCalled();
  const result = await getSeoTask(uid, saved.taskId, saved.contextHash, true);
  expect(result.freshGoogle?.ga4.status).toBe('available');
  expect(result.contextHash).toBe(saved.contextHash);
  expect(result.proposal?.hash).toBe(saved.proposal?.hash);
  expect(result.publicReceipt).toBeTruthy();
  expect([...store.rows]).toEqual(before); expect(m.google).toHaveBeenCalledOnce();
  expect(m.apply).not.toHaveBeenCalled(); expect(m.paid).not.toHaveBeenCalled();
});
it('stops a Danish body on EN even if a model approves its metadata proposal', async () => {
  const danish = `${body} ` + 'Hun var på scenen og havde meget at sige men der blev ikke noget efter det som hun skulle med flere fra sig hvor lidt kunne være. '.repeat(6);
  m.current.snapshot.locale = 'en';
  m.current.live.fieldData.content = `<p>${danish}</p>`;
  m.current.publicUrl = 'https://www.aproposmagazine.com/en/articles/familien';
  const task = (await claimSeoTasks(uid, { requestId: 'locale-test-1', articleId: itemId, locale: 'en', limit: 1 })).tasks[0];
  expect(task.languageCheck.status).toBe('locale_mismatch');
  const saved = await saveSeoReview(uid, proposal(task));
  const result = await applySeoReview(uid, applyInput(saved));
  expect(result.status).toBe('needs_editor'); expect(result.reason).toBe('locale_content_mismatch');
  expect(result.publicReceipt).toBeNull(); expect(m.apply).not.toHaveBeenCalled();
  expect(m.current.live.fieldData.content).toBe(`<p>${danish}</p>`);
});
