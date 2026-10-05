import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const state = vi.hoisted(() => ({ db: null as any, inspect: vi.fn(), find: vi.fn() }));
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
