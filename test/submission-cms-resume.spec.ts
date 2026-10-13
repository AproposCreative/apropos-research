import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { normalizeArticlePayload } from '@/lib/articles/article-payload';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
const state = vi.hoisted(() => ({ db: null as any, cms: {} as any, member: true }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/mcp/oauth', () => ({ activeMember: async () => state.member }));
vi.mock('@/lib/editorial/submission-published-target', () => ({ readSubmissionCms: async () => {
  expect(() => assertPaidAiAllowed()).toThrow(); return state.cms;
} }));
import { resumeSubmissionCms } from '@/lib/editorial/submission-cms-resume';
const id = 'a'.repeat(64), hash = 'b'.repeat(64), path = `editorialSubmissions/${id}`;
const stage = `${path}/stages/${hash}-cms`, save = `writerWorkspaces/owner/cmsSaves/submission-${id}`;
let memory: ReturnType<typeof memoryFirestore>, input: any;
beforeEach(() => {
  memory = memoryFirestore(); state.db = memory.db; state.member = true;
  const article = { title: 'Short title', content: '<p>Preserved prose</p>', featuredImage: 'https://image.test/cover.jpg' };
  const normalized = normalizeArticlePayload({ ...article, status: 'draft', workflowState: 'webflow_draft' });
  const { publishDate: _date, webflowId: _webflow, id: _id, ...stable } = normalized;
  const fields = { name: 'Old title', 'watch-now-link': null };
  state.cms = { id: 'item', isDraft: true, lastPublished: null, fieldData: { ...fields, 'watch-now-link': 'https://www.netflix.com/title/81278442' } };
  memory.rows.set(path, { id, uid: 'owner', revision: 10, contentHash: hash, status: 'blocked', blockedStep: 'cms', blocker: 'mcp_submission_step_unconfirmed', executionPolicy: 'chatgpt-first-v1',
    choices: { kind: 'review', media: 'press', bodyImages: 'required', aiFinalChecks: 'human' }, article, originalArticle: article,
    approval: { uid: 'owner', contentHash: hash, acceptedAt: new Date().toISOString(), editorialDecision: { bodyImages: 'required', aiFinalChecks: 'human' } },
    publicationConsentPending: true, publicationConsent: { uid: 'owner', revision: 5, contentHash: 'old' },
    prepared: { itemId: 'item', proof: { fieldDataHash: cmsFieldHash(fields) } } });
  memory.rows.set(stage, { status: 'attempted', name: 'cms', inputPayload: article });
  memory.rows.set(save, { token: 'old-token', phase: 'preparing', leaseUntil: 0, articleId: 'item', hash: cmsFieldHash(stable) });
  for (const name of ['cover', 'body-1', 'body-2', 'visual', 'checks']) memory.rows.set(`${path}/stages/${hash}-${name}`, { status: 'done', result: { originalPreserved: true } });
  input = { submissionId: id, expectedRevision: 10, expectedCmsHash: cmsFieldHash(state.cms.fieldData) };
});
it('queues precisely the pre-write stage, preserving receipts/approval and replaying after a lost response', async () => {
  const priorSave = structuredClone(memory.rows.get(save));
  expect(await resumeSubmissionCms('owner', input)).toMatchObject({ status: 'processing', replay: false, itemId: 'item', publicationApproval: false, paidAiCalls: 0 });
  expect(memory.rows.get(stage).status).toBe('retryable_before_write');
  expect(memory.rows.get(save)).toEqual(priorSave);
  expect(memory.rows.get(path)).toMatchObject({ revision: 10, publicationConsentPending: false, publicationConsent: { revision: 5 } });
  expect(await resumeSubmissionCms('owner', input)).toMatchObject({ replay: true, currentStatus: 'processing' });
  expect([...memory.rows.keys()].filter(p => p.includes('/cmsResumptions/'))).toHaveLength(1);
  expect([...memory.rows.keys()].filter(p => p.includes('/approvals/') || p.includes('/publicationConsents/'))).toHaveLength(0);
});
it.each([
  ['write already attempted', () => { memory.rows.get(save).phase = 'attempted'; }],
  ['canonical write marker', () => { memory.rows.get(save).expected = {}; }],
  ['active save lease', () => { memory.rows.get(save).leaseUntil = Date.now() + 10000; }],
  ['other item', () => { memory.rows.get(save).articleId = 'different'; }],
  ['not CMS failure', () => { memory.rows.get(path).blockedStep = 'cover'; }],
  ['unfinished check', () => { memory.rows.get(`${path}/stages/${hash}-checks`).status = 'attempted'; }],
  ['changed input', () => { memory.rows.get(save).hash = 'changed'; }],
  ['new revision', () => { memory.rows.get(path).revision++; }],
  ['revoked access', () => { state.member = false; }],
  ['active worker', () => { memory.rows.get(path).workerUntil = Date.now() + 10000; }],
  ['changed CMS prose', () => { state.cms.fieldData.content = 'new prose'; }],
])('refuses unsafe recovery: %s', async (_name, change) => {
  change(); await expect(resumeSubmissionCms('owner', input)).rejects.toThrow();
  expect(memory.rows.get(stage).status).toBe('attempted');
  expect([...memory.rows.keys()].filter(p => p.includes('/cmsResumptions/'))).toHaveLength(0);
});
it('requires owner and exact fresh CMS hash', async () => {
  await expect(resumeSubmissionCms('other', input)).rejects.toThrow('not_found');
  await expect(resumeSubmissionCms('owner', { ...input, expectedCmsHash: 'c'.repeat(64) })).rejects.toThrow('cms_conflict');
});
