import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
import { inspectSubmission, submissionInput } from '@/lib/editorial/submission-contract';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
const options = { authors: [{ id: 'a'.repeat(24), name: 'Frederik Kragh' }], categories: [{ id: 'b'.repeat(24), name: 'Kultur' }],
  topics: [{ id: 'c'.repeat(24), name: 'Film' }], requiredFields: ['name'], checkedAt: '2026-10-05T00:00:00Z' };
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => options }));
import { prepareSubmission, updateSubmission, getSubmissionStatus } from '@/lib/editorial/submissions';
import { submissionVersion } from '@/lib/editorial/submission-contract';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { approvedSubmissionPolicy } from '@/lib/editorial/submission-policy';
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => { memory = memoryFirestore(); state.db = memory.db; });
const input = () => submissionInput.parse({ requestId: 'article-from-chat-0001', article: { title: 'En anmeldelse', content: '<p>Min egen tekst.</p>' } });

it('asks at most three relevant questions without guessing author or rating', () => {
  const value = input(); value.choices.kind = 'review';
  const result = inspectSubmission(value, options);
  expect(result.questions.map(q => q.field)).toEqual(['author', 'category', 'subjectType']);
  expect(result.remainingQuestionCount).toBeGreaterThan(0);
  expect(result.publicationReady).toBe(false);
  expect(value.article.author).toBeUndefined(); expect(value.article.rating).toBeUndefined();
});
it('film uses real stills and rejects illustration even when requested', () => {
  const value = input(); value.article.subjectType = 'film'; value.choices.media = 'illustration';
  expect(inspectSubmission(value, options).blockers).toContain('film_requires_real_stills');
  expect(inspectSubmission(value, options).suggestedMedia).toBe('press');
});
it('rejects rating on a news article and unknown topic identities', () => {
  const value = input(); value.choices.kind = 'news'; value.article.rating = 5; value.article.topicsSelected = ['wrong'];
  expect(inspectSubmission(value, options).blockers).toEqual(['non_review_has_review_fields', 'unknown_topic']);
});
it('does not count duplicates or the hero as two distinct body images', () => {
  const value = input(); value.article.featuredImage = 'https://example.com/hero.webp';
  value.article.content += '<img src="https://example.com/hero.webp"><img src="https://example.com/body.webp"><img src="https://example.com/body.webp">';
  expect(inspectSubmission(value, options).missingMedia).toEqual(['body-2']);
});
it('cover-only is a saved proposal with two recommendations, never a missing cover exemption', async () => {
  const value = input(); value.choices.bodyImages = 'deferred';
  expect(inspectSubmission(value, options)).toMatchObject({ missingMedia: ['cover'], recommendedMedia: ['body-1', 'body-2'] });
  value.article.featuredImage = 'https://example.com/hero.png';
  const saved = await prepareSubmission('owner', value);
  expect(saved.missingMedia).toEqual([]); expect(saved.recommendedMedia).toHaveLength(2);
  expect(saved.choices.bodyImages).toBe('deferred'); expect(saved.publicationReady).toBe(false);
});
it('retains exact copy and returns same identity for a duplicate submission', async () => {
  const first = await prepareSubmission('owner', input()), second = await prepareSubmission('owner', input());
  expect(second.id).toBe(first.id); expect(second.revision).toBe(1);
  expect(second.originalArticle).toEqual(input().article); expect(second.paidAiCalls).toBe(0);
  await expect(prepareSubmission('owner', { ...input(), article: { ...input().article, title: 'Changed' } })).rejects.toThrow('idempotency_conflict');
});
it('new submissions are zero-paid-AI but still need personal approval and body images by default', async () => {
  const row = await prepareSubmission('owner', input());
  expect(row.executionPolicy).toBe('chatgpt-first-v1'); expect(row.choices.aiFinalChecks).toBe('human');
  expect(row.choices.bodyImages).toBeUndefined(); expect(row.missingMedia).toEqual(['cover', 'body-1', 'body-2']);
  expect(() => approvedSubmissionPolicy({ ...row, status: 'draft' })).toThrow('editorial_decision_required');
  await expect(updateSubmission('owner', { submissionId: row.id, expectedRevision: 1, requestId: 'attempt-paid-check-01', choices: { aiFinalChecks: 'required' } })).rejects.toThrow('paid_ai_disabled');
  await expect(prepareSubmission('owner', { ...input(), requestId: 'another-paid-request', choices: { aiFinalChecks: 'required' } })).rejects.toThrow('paid_ai_disabled');
});
it('replays legacy requests without changing their policy, hash, choices or approval', async () => {
  const value = input(), id = cmsFieldHash({ uid: 'owner', requestId: value.requestId }), hash = submissionVersion(value);
  const old = { ...value, id, uid: 'owner', revision: 3, originalArticle: value.article, initialHash: hash, contentHash: hash,
    executionPolicy: 'chat-final-checks-v1', status: 'draft', approval: { contentHash: hash } };
  memory.rows.set(`editorialSubmissions/${id}`, old);
  const result = await prepareSubmission('owner', value);
  expect(result.executionPolicy).toBe('chat-final-checks-v1'); expect(result.choices.aiFinalChecks).toBeUndefined();
  expect(memory.rows.get(`editorialSubmissions/${id}`)).toEqual(old);
});
it('one private Liv identity survives a new conversation and separates reserve from scheduled work', async () => {
  const value = { ...input(), livProduction: { kind: 'scheduled', day: '2026-10-10' } };
  const first = await prepareSubmission('owner', value);
  expect((await prepareSubmission('owner', { ...value, requestId: 'new-conversation-01' })).id).toBe(first.id);
  await expect(prepareSubmission('owner', { ...value, article: { ...value.article, title: 'Duplicate' } })).rejects.toThrow('production_exists');
  expect((await prepareSubmission('owner', { ...value, livProduction: { kind: 'reserve', day: '2026-10-10' } })).id).not.toBe(first.id);
  expect((await prepareSubmission('colleague', value)).id).not.toBe(first.id);
  const next = await updateSubmission('owner', { submissionId: first.id, requestId: 'update-production-01', expectedRevision: 1, article: { subtitle: 'Gemte valg' } });
  expect(next.livProduction).toEqual(value.livProduction);
  await expect(prepareSubmission('owner', { ...value, livProduction: { kind: 'scheduled', day: '2026-10-11' } })).rejects.toThrow();
  expect([...memory.rows.keys()].some(k => k.startsWith('livDelivery/'))).toBe(false);
});
it('isolates different owners and does not mutate Writer or Liv', async () => {
  const first = await prepareSubmission('owner', input());
  await expect(getSubmissionStatus('other', first.id)).rejects.toThrow('not_found');
  expect((await prepareSubmission('other', input())).id).not.toBe(first.id);
  expect([...memory.rows.keys()].every(k => k.startsWith('editorialSubmissions/'))).toBe(true);
});
it('saves answers with immutable history and checks revision', async () => {
  const first = await prepareSubmission('owner', input());
  const edit = { submissionId: first.id, expectedRevision: 1, requestId: 'answer-category-0001', article: { category: options.categories[0].id } };
  const next = await updateSubmission('owner', edit);
  expect(next.revision).toBe(2); expect(next.article.content).toBe(first.article.content);
  expect(next.originalArticle).toEqual(first.originalArticle);
  expect((await updateSubmission('owner', edit)).revision).toBe(2);
  await expect(updateSubmission('owner', { ...edit, requestId: 'answer-category-0002' })).rejects.toThrow('revision_conflict');
  expect(memory.rows.get(`editorialSubmissions/${first.id}/versions/1`).article).toEqual(first.article);
});
it('rejects executable markup and caller-supplied approval/status', async () => {
  await expect(prepareSubmission('owner', { ...input(), approved: true })).rejects.toThrow();
  await expect(prepareSubmission('owner', { ...input(), article: { ...input().article, content: '<script>alert(1)</script>' } })).rejects.toThrow('unsafe_article_markup');
  expect(memory.rows.size).toBe(0);
});
