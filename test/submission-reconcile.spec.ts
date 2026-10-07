import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const state = vi.hoisted(() => ({ db: null as any, inspect: vi.fn(), find: vi.fn(), media: vi.fn() }));
vi.mock('@/lib/editorial/submission-published-target', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/editorial/submission-published-target')>(),
  verifyStagedMedia: (...args: unknown[]) => state.media(...args) }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [], requiredFields: [], checkedAt: '' }) }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: (...args: unknown[]) => state.inspect(...args) }));
vi.mock('@/lib/articles/find-staged-save', () => ({ stagedSaveCandidates: (...args: unknown[]) => state.find(...args) }));
import { reconcileSubmission } from '@/lib/editorial/submission-reconcile';
const id = 'a'.repeat(64), version = 'b'.repeat(64), path = `editorialSubmissions/${id}`, save = `writerWorkspaces/owner/cmsSaves/submission-${id}`;
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => {
  vi.clearAllMocks(); memory = memoryFirestore(); state.db = memory.db;
  const article = { title: 'Artikel', content: '<p>Den gemte tekst.</p>' };
  memory.rows.set(path, { id, uid: 'owner', status: 'blocked', revision: 1, contentHash: version, article, originalArticle: article, research: [], choices: { style: 'expressive' } });
  const payload = normalizeArticlePayload({ ...article, id: `submission-${id}`, status: 'draft', workflowState: 'webflow_draft' });
  const { publishDate, webflowId, id: localId, ...stable } = payload;
  memory.rows.set(save, { hash: cmsFieldHash(stable), token: 'saved-token', phase: 'attempted', leaseUntil: 0, expected: payload, beforeIds: [] });
  memory.rows.set(`${path}/stages/${version}-cms`, { status: 'attempted', inputPayload: payload });
  for (const name of ['visual', 'checks', 'cover', 'body-1', 'body-2']) memory.rows.set(`${path}/stages/${version}-${name}`, { status: 'done', result: { name } });
  state.find.mockResolvedValue(['c'.repeat(24)]);
  state.inspect.mockResolvedValue({ publicationReady: true, draftConfirmed: true, checks: [{ ok: true }], fieldDataHash: 'cms' });
});
it('recovers one saved CMS item by readback without dispatching new production', async () => {
  const result = await reconcileSubmission('owner', id);
  expect(result.status).toBe('prepared'); expect(result.publicationReady).toBe(false);
  expect(memory.rows.get(save)).toMatchObject({ phase: 'saved', articleId: 'c'.repeat(24) });
  expect(memory.rows.get(`${path}/stages/${version}-cms`).reconciled).toBe(true);
});
it('rejects ambiguous candidates, changed save inputs and another user', async () => {
  state.find.mockResolvedValueOnce(['c'.repeat(24), 'd'.repeat(24)]);
  await expect(reconcileSubmission('owner', id)).rejects.toThrow('evidence_missing');
  memory.rows.get(save).hash = 'changed';
  await expect(reconcileSubmission('owner', id)).rejects.toThrow('revision_conflict');
  await expect(reconcileSubmission('other', id)).rejects.toThrow('not_found');
  expect(memory.rows.get(path).status).toBe('blocked');
});
it('reconciles the already-approved cover-only update without creating, patching or reapproving it', async () => {
  const row = memory.rows.get(path);
  row.executionPolicy = 'chat-final-checks-v1'; row.choices = { bodyImages: 'deferred', aiFinalChecks: 'human' };
  row.approval = { uid: 'owner', contentHash: version, acceptedAt: '2026-10-07T07:59:58.217Z', editorialDecision: row.choices };
  const approval = structuredClone(row.approval);
  row.blocker = 'mcp_submission_cms_checks_failed'; row.blockedStep = 'cms';
  row.publishedTarget = { itemId: 'c'.repeat(24), fields: {}, fieldDataHash: 'old' };
  const cms = memory.rows.get(`${path}/stages/${version}-cms`);
  cms.mediaUpdate = { target: row.publishedTarget, expected: cms.inputPayload };
  state.media.mockImplementation(async (target, expected, policy, recordProof) => {
    expect(policy).toMatchObject({ minimumBodyImages: 0, allowPublishedUpdate: true, preserveProvidedImages: true });
    const proof = await state.inspect(); await recordProof(proof); return { itemId: target.itemId, expected, proof };
  });
  const result = await reconcileSubmission('owner', id);
  expect(result.status).toBe('prepared'); expect(result.revision).toBe(1);
  expect(result.approval).toEqual(approval); expect(result.blocker).toBeNull();
  expect(memory.rows.get(`${path}/stages/${version}-cms`)).toMatchObject({ status: 'done', reconciled: true,
    priorBlocker: 'mcp_submission_cms_checks_failed', priorBlockedStep: 'cms', checks: { publicationReady: true } });
  expect(state.find).not.toHaveBeenCalled(); expect(result).not.toHaveProperty('publication');
});
it('keeps a failed readback blocked and retains its findings instead of marking it ready', async () => {
  state.inspect.mockResolvedValue({ publicationReady: false, draftConfirmed: true, checks: [{ id: 'image:body-assets', ok: false }], fieldDataHash: 'cms' });
  await expect(reconcileSubmission('owner', id)).rejects.toThrow('cms_checks_failed');
  expect(memory.rows.get(path).status).toBe('blocked');
  expect(memory.rows.get(`${path}/stages/${version}-cms`)).toMatchObject({ status: 'attempted', checks: { publicationReady: false } });
});
