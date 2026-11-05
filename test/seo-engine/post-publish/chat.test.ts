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
import { claimSeoTasks, getSeoTask, saveSeoReview, reviseSeoReview, applySeoReview, activateChatSeo } from '../../../lib/seo-engine/post-publish/chat';
import { enqueueQualityJob, claimQualityJob } from '../../../lib/seo-engine/post-publish/jobs';
import { assertLegacySeoProcessor, seoStateId } from '../../../lib/seo-engine/post-publish/processor';
import { assertPaidAiAllowed } from '../../../lib/ai/no-paid-calls';
import { reviewKey } from '../../../lib/seo-engine/post-publish/policy';
import { copenhagenClock } from '../../../lib/liv/delivery-policy';
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

it('continues a scheduled run past twelve skipped publication candidates without resetting them', async () => {
  const ids = Array.from({ length: 14 }, (_, index) => (index + 1).toString(16).padStart(24, '0'));
  const jobs: string[] = [];
  m.read.mockImplementation(async (id: string) => ({ ...structuredClone(m.current),
    snapshot: { ...structuredClone(m.current.snapshot), itemId: id } }));
  for (const [index, id] of ids.entries()) {
    const snapshot = { ...structuredClone(m.current.snapshot), itemId: id };
    const result = await enqueueQualityJob({ source: 'webhook', mode: 'publication_quality', snapshot,
      article: { editorialTitle: 'Familien', body, locale: 'da', metadata: snapshot.metadata } });
    jobs.push(result.jobId!);
    store.rows.get(`seoPostPublishJobs/${result.jobId}`).createdAt = `2026-11-05T06:${String(index).padStart(2, '0')}:00Z`;
    if (index < 13) store.rows.set(`seoPostPublishArticles/${seoStateId(id, 'da')}`, { publicationPreservedKey: reviewKey(snapshot) });
  }
  const before = structuredClone(store.rows.get(`seoPostPublishJobs/${jobs[0]}`));
  const prefix = `apropos-seo-${copenhagenClock().day}-h09`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const batch = await claimSeoTasks(uid, { requestId: `${prefix}-b1` });
    expect(batch.tasks).toHaveLength(0); expect(batch.hasMore).toBe(true);
  }
  const second = await claimSeoTasks(uid, { requestId: `${prefix}-b2` });
  expect(second.tasks.map(task => task.article.itemId)).toEqual([ids[13]]);
  expect(second.skipped).toHaveLength(1); expect(second.hasMore).toBe(false);
  expect(m.read).toHaveBeenCalledTimes(14);
  const replay = await claimSeoTasks(uid, { requestId: `${prefix}-b2` });
  expect(replay.tasks[0].taskId).toBe(second.tasks[0].taskId); expect(m.read).toHaveBeenCalledTimes(14);
  expect(store.rows.get(`seoPostPublishJobs/${jobs[0]}`)).toEqual(before);
  expect(m.apply).not.toHaveBeenCalled(); expect(m.paid).not.toHaveBeenCalled();
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

it.each(['–', '—', '&ndash;', '&#8212;'])('rejects review typography before durably saving a proposal: %s', async dash => {
  const task = await claim(), input = proposal(task);
  input.assessments[1].proposedValue = `Filmen følger familien ${dash} med varme og humor.`;
  await expect(saveSeoReview(uid, input)).rejects.toThrow('seo_review_long_dash_forbidden');
  expect((await getSeoTask(uid, task.taskId)).proposal).toBeNull();
  expect(m.apply).not.toHaveBeenCalled();
});

async function legacyInvalidProposal() {
  const saved = await saveSeoReview(uid, proposal(await claim()));
  const row = store.rows.get(`seoPostPublishJobs/${saved.taskId}`);
  row.chatReview.proposal.assessments[1].proposedValue = 'Familien skildrer København – med varme og humor.';
  row.chatReview.proposal.hash = 'e'.repeat(64);
  row.chatReview.proposal.after.metaDescription = row.chatReview.proposal.assessments[1].proposedValue;
  row.reason = 'seo_review_long_dash_forbidden';
  return getSeoTask(uid, saved.taskId);
}
function revisionInput(task: Awaited<ReturnType<typeof getSeoTask>>) {
  return { ...proposal(task), requestId: 'revision-stable-1', expectedPreviousProposalHash: task.proposal!.hash,
    reason: 'Retter et afvist tegnsætningsforslag uden ændring af fakta eller artikeltekst.' };
}

it('settles a historical forbidden proposal as actionable without sending it to CMS or monopolizing the queue', async () => {
  const saved = await legacyInvalidProposal();
  const result = await applySeoReview(uid, applyInput(saved));
  expect(result.status).toBe('needs_editor'); expect(result.reason).toBe('seo_review_long_dash_forbidden');
  expect(result.nextAction).toBe('revise_rejected_proposal');
  expect(result.writeStartedAt).toBeNull(); expect(result.publicReceipt).toBeNull();
  expect(store.rows.get(stateKey).chatJobId).toBeNull();
  expect(m.apply).not.toHaveBeenCalled(); expect(m.paid).not.toHaveBeenCalled();
});

it.each(['queued', 'needs_editor'])('revises an unwritten %s rejection with immutable history, a fresh recheck and idempotent replay', async status => {
  let rejected = await legacyInvalidProposal();
  rejected = await applySeoReview(uid, applyInput(rejected));
  const row = store.rows.get(`seoPostPublishJobs/${rejected.taskId}`);
  row.status = status;
  const previous = structuredClone({ proposal: row.chatReview.proposal, recheck: row.chatReview.recheck, reason: row.reason, status });
  const input = revisionInput(rejected);
  const revised = await reviseSeoReview(uid, input);
  expect(revised.status).toBe('queued'); expect(revised.reason).toBe('proposal_saved_not_published');
  expect(revised.recheck).toBeNull(); expect(revised.proposal!.hash).not.toBe(previous.proposal.hash);
  expect(revised.contextHash).toBe(rejected.contextHash);
  const auditKey = `seoPostPublishJobs/${rejected.taskId}/proposalRevisions/${revised.revisionHash}`;
  const history = structuredClone(store.rows.get(auditKey));
  expect(history.previous).toEqual(previous); expect(history.reason).toBe(input.reason);
  expect(history.proposalHash).toBe(revised.proposal!.hash);
  expect(store.rows.get(stateKey).chatJobId).toBe(rejected.taskId);
  expect(m.apply).not.toHaveBeenCalled();
  const beforeReplay = structuredClone([...store.rows]);
  expect(await reviseSeoReview(uid, input)).toEqual(revised);
  expect([...store.rows]).toEqual(beforeReplay);
  await expect(reviseSeoReview(uid, { ...input, reason: 'Et andet indhold på samme revisionsidentitet er ikke en genoptagelse.' }))
    .rejects.toThrow('seo_chat_revision_request_changed');
  await expect(applySeoReview(uid, applyInput(rejected))).rejects.toThrow('seo_chat_proposal_changed');
  const applied = await applySeoReview(uid, applyInput(revised));
  expect(applied.status).toBe('applied'); expect(applied.publicReceipt).toBeTruthy();
  expect(store.rows.get(auditKey)).toEqual(history); expect(m.apply).toHaveBeenCalledOnce();
  // A replay after publication is read-only and returns the current receipt.
  expect((await reviseSeoReview(uid, input)).publicReceipt).toEqual(applied.publicReceipt);
  expect(m.apply).toHaveBeenCalledOnce(); expect(m.paid).not.toHaveBeenCalled();
});

it.each(['write', 'pending', 'lease', 'other_owner', 'applied', 'kept', 'other_issue', 'other_reservation', 'not_rejected'])('refuses unsafe revision: %s', async issue => {
  const saved = await legacyInvalidProposal(), row = store.rows.get(`seoPostPublishJobs/${saved.taskId}`);
  const state = store.rows.get(stateKey);
  if (issue === 'write') row.writeStartedAt = new Date().toISOString();
  if (issue === 'pending') state.pendingJobId = saved.taskId;
  if (issue === 'lease') row.leaseUntil = Date.now() + 60_000;
  if (issue === 'other_reservation') state.chatJobId = 'f'.repeat(64);
  if (issue === 'applied' || issue === 'kept') row.status = issue;
  if (issue === 'other_issue') { row.status = 'needs_editor'; row.reason = 'locale_content_mismatch'; }
  if (issue === 'not_rejected') row.reason = 'proposal_saved_not_published';
  const before = structuredClone([...store.rows]);
  await expect(reviseSeoReview(issue === 'other_owner' ? 'other' : uid, revisionInput(saved))).rejects.toThrow('seo_');
  expect([...store.rows]).toEqual(before); expect(m.apply).not.toHaveBeenCalled();
});

it.each(['content', 'metadata', 'staged', 'context', 'previous_proposal', 'lock', 'preserved', 'invalid_candidate'])('rejects revision after changed %s without replacing saved evidence', async change => {
  const saved = await legacyInvalidProposal(), input = revisionInput(saved);
  if (change === 'content') m.current.snapshot.contentVersion = 'changed-article';
  if (change === 'metadata') m.current.snapshot.metadata.seoTitle = 'Redaktionens rettede titel';
  if (change === 'staged') m.current.snapshot.hasUnpublishedChanges = true;
  if (change === 'context') input.expectedContextHash = 'f'.repeat(64);
  if (change === 'previous_proposal') input.expectedPreviousProposalHash = 'f'.repeat(64);
  if (change === 'lock') store.rows.get(stateKey).lockedFields = ['metaDescription'];
  if (change === 'preserved') store.rows.get(stateKey).publicationPreservedKey = reviewKey(m.current.snapshot);
  if (change === 'invalid_candidate') input.assessments[1].proposedValue = 'Familien i København – en ny forkert tankestreg.';
  const before = structuredClone([...store.rows]);
  await expect(reviseSeoReview(uid, input)).rejects.toThrow('seo_');
  expect([...store.rows]).toEqual(before); expect(m.apply).not.toHaveBeenCalled();
});

it('serializes concurrent identical revisions without duplicate history or resetting the next proposal', async () => {
  const saved = await legacyInvalidProposal(), input = revisionInput(saved);
  const [a, b] = await Promise.all([reviseSeoReview(uid, input), reviseSeoReview(uid, input)]);
  expect(a.proposal!.hash).toBe(b.proposal!.hash); expect(a.revisionHash).toBe(b.revisionHash);
  expect([...store.rows.keys()].filter(key => key.includes('/proposalRevisions/'))).toHaveLength(1);
  const next = { ...input, requestId: 'revision-concurrent-2' };
  await expect(reviseSeoReview(uid, next)).rejects.toThrow('seo_chat_revision_status_invalid');
});

it('does not let an apply started before revision overwrite or publish the revised proposal', async () => {
  const saved = await legacyInvalidProposal(), input = revisionInput(saved);
  const transaction = store.db.runTransaction;
  let revised: Awaited<ReturnType<typeof reviseSeoReview>> | undefined;
  const race = vi.spyOn(store.db, 'runTransaction').mockImplementationOnce(async fn => {
    revised = await reviseSeoReview(uid, input);
    return transaction(fn);
  });
  try {
    await expect(applySeoReview(uid, applyInput(saved))).rejects.toThrow('seo_chat_proposal_changed');
    const current = await getSeoTask(uid, saved.taskId);
    expect(current.proposal!.hash).toBe(revised!.proposal!.hash); expect(current.recheck).toBeNull();
    expect(current.status).toBe('queued'); expect(current.reason).toBe('proposal_saved_not_published');
    expect(store.rows.get(`seoPostPublishJobs/${saved.taskId}`).leaseUntil).toBe(0);
    expect(m.apply).not.toHaveBeenCalled();
    expect((await applySeoReview(uid, applyInput(current))).status).toBe('applied');
    expect(m.apply).toHaveBeenCalledOnce();
  } finally { race.mockRestore(); }
});

it.each([false, true])('a technical performance rejection preserves existing cooldown (%s) and permits correcting the same proposal', async priorReview => {
  const previous = priorReview ? new Date(Date.now() - 45 * 86400_000).toISOString() : undefined;
  if (previous) store.rows.set(stateKey, { lastPerformanceReviewedAt: previous });
  await enqueueQualityJob({ source: 'performance', manualRequested: true, mode: 'performance', snapshot: m.current.snapshot,
    article: { editorialTitle: 'Familien', body, locale: 'da', metadata: m.current.snapshot.metadata },
    evidence: { fetchedAt: new Date().toISOString(), comparable: true, currentDays: 28, previousDays: 28,
      currentImpressions: 500, previousImpressions: 400 } });
  const task = (await claimSeoTasks(uid, { requestId: 'performance-revision-1', limit: 1 })).tasks[0];
  const saved = await saveSeoReview(uid, proposal(task));
  m.duplicates.mockResolvedValueOnce({ seoTitle: [], metaDescription: ['duplicate-article'] });
  const rejected = await applySeoReview(uid, applyInput(saved));
  expect(rejected.status).toBe('needs_editor'); expect(rejected.reason).toBe('seo_metadata_duplicate');
  expect(store.rows.get(stateKey).lastPerformanceReviewedAt).toBe(previous);
  const revised = await reviseSeoReview(uid, revisionInput(rejected));
  expect(revised.proposal!.technicalDecision.reason).toBe('eligible_pending_chatgpt_recheck');
  const result = await applySeoReview(uid, applyInput(revised));
  expect(result.status).toBe('applied'); expect(result.publicReceipt).toBeTruthy();
  expect(store.rows.get(stateKey).lastPerformanceReviewedAt).not.toBe(previous);
  expect(m.apply).toHaveBeenCalledOnce();
});

it('keeps ambiguous writes on readback even when an error code otherwise denotes a deterministic prewrite failure', async () => {
  const saved = await saveSeoReview(uid, proposal(await claim()));
  m.apply.mockImplementationOnce(async args => {
    await args.beforeWrite(m.current.snapshot);
    throw Error('seo_review_long_dash_forbidden');
  });
  const result = await applySeoReview(uid, applyInput(saved));
  expect(result.status).toBe('verify_pending'); expect(result.writeStartedAt).toBeTruthy();
  expect(result.nextAction).not.toBe('revise_rejected_proposal');
  expect(store.rows.get(stateKey).pendingJobId).toBe(saved.taskId);
  await expect(reviseSeoReview(uid, revisionInput(result))).rejects.toThrow('seo_chat_revision_write_pending');
});

it('registers a scheduled batch once in the current Copenhagen day without admitting arbitrary or historical request IDs', async () => {
  const day = copenhagenClock(new Date()).day;
  const input = { requestId: `apropos-seo-${day}-h13-b2`, limit: 2 };
  const first = await claimSeoTasks(uid, input);
  const registry = store.rows.get(`seoPostPublishControl/chat-runs-${day}`);
  expect(Object.keys(registry.entries)).toEqual([first.batchId]);
  expect(registry.entries[first.batchId]).toMatchObject({ batchId: first.batchId, requestId: input.requestId, slotHour: 13, batchNumber: 2 });
  const before = structuredClone(registry);
  await claimSeoTasks(uid, input);
  expect(store.rows.get(`seoPostPublishControl/chat-runs-${day}`)).toEqual(before);
  await claimSeoTasks(uid, { requestId: 'apropos-seo-2020-01-01-h09-b1', limit: 2 });
  expect(store.rows.has('seoPostPublishControl/chat-runs-2020-01-01')).toBe(false);
});
