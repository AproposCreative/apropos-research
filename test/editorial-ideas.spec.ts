import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [], topics: [], requiredFields: [], checkedAt: '' }) }));
import { saveEditorialIdeas, getEditorialDesk, getEditorialIdea, startEditorialIdea, ideaSubmissionId } from '@/lib/editorial/ideas';
import { prepareSubmission, updateSubmission } from '@/lib/editorial/submissions';
import { editorialWorkflow } from '@/lib/editorial/workflows';
import { editorialDeskWidgetHtml } from '@/lib/mcp/editorial-desk-widget';
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => { memory = memoryFirestore(); state.db = memory.db; });
const idea = { topicKey: 'venskab-i-tv', title: 'Venskab i tv', suggestedKind: 'culture-guide' as const, angle: 'Undersøg venskabet som hovedhistorie.', whyNow: 'Et muligt kulturtema', caveats: 'Aktualitet skal undersøges.',
  sources: [{ title: 'Kildespor', url: 'https://example.com/article', retrievedAt: '2026-10-12T10:00:00Z', publishedAt: null, notes: 'Ikke uafhængigt verificeret' }] };
const save = () => saveEditorialIdeas('owner', { requestId: 'editorial-brief-2026-10-12', ideas: [idea] });

it('persists ideas separately from articles without CMS, AI, approval or delivery writes', async () => {
  const saved = await save(), desk = await getEditorialDesk('owner', {});
  expect(desk.ideas[0]).toMatchObject({ id: saved.ids[0], topicKey: idea.topicKey, status: 'suggested', factsVerified: false, publicationApproval: false, submission: null });
  expect(desk.drafts).toEqual([]); expect(desk.paidAiCalls).toBe(0);
  expect([...memory.rows.keys()].every(k => k.startsWith('writerWorkspaces/owner/editorialIdea'))).toBe(true);
});
it('replays identical imports and deduplicates across briefs without overwriting evidence', async () => {
  const a = await save(); expect((await save()).replay).toBe(true);
  const b = await saveEditorialIdeas('owner', { requestId: 'next-week-brief-2026-10-19', ideas: [{ ...idea, title: 'En anden foreslået titel' }] });
  expect(b.ids).toEqual(a.ids); expect(b.ideas[0].title).toBe(idea.title);
  await expect(saveEditorialIdeas('owner', { requestId: 'editorial-brief-2026-10-12', ideas: [{ ...idea, title: 'Changed' }] })).rejects.toThrow('idempotency_conflict');
});
it('isolates people and rejects caller-supplied owner, approval and unsafe URLs', async () => {
  const a = await save();
  await expect(getEditorialIdea('other', { ideaId: a.ids[0] })).rejects.toThrow('not_found');
  await expect(startEditorialIdea('other', { ideaId: a.ids[0], expectedRevision: 1 })).rejects.toThrow('not_found');
  for (const extra of [{ uid: 'other' }, { publicationApproval: true }]) await expect(saveEditorialIdeas('owner', { requestId: 'editorial-brief-2026-10-12', ideas: [idea], ...extra })).rejects.toThrow();
  for (const url of ['https://example.com/?token=secret', 'http://127.0.0.1/private', 'javascript:alert(1)']) await expect(saveEditorialIdeas('owner', { requestId: 'unsafe-editorial-brief', ideas: [{ ...idea, sources: [{ ...idea.sources[0], url }] }] })).rejects.toThrow();
  expect((await getEditorialDesk('other', {})).ideas).toEqual([]);
});
it('selects atomically and resumes after timeout/concurrent clicks without double identity', async () => {
  const a = await save(), args = { ideaId: a.ids[0], expectedRevision: 1 };
  const [one, two] = await Promise.all([startEditorialIdea('owner', args), startEditorialIdea('owner', args)]);
  expect(one.handoff).toEqual(two.handoff); expect(one.revision).toBe(2); expect(one.status).toBe('selected');
  expect(one.submission).toBeNull(); expect((await startEditorialIdea('owner', args)).selectedAt).toBe(one.selectedAt);
  await expect(startEditorialIdea('owner', { ...args, expectedRevision: 9 })).rejects.toThrow('revision_conflict');
});
it('requires selection, keeps one real submission, preserves its identity on edit and never creates a blank article', async () => {
  const a = await save(), handoff = a.ideas[0].handoff;
  const input = { requestId: handoff.requestId, editorialIdeaId: a.ids[0], article: { title: idea.title, content: '<p>En faktisk færdig tekst.</p>' } };
  await expect(prepareSubmission('owner', input)).rejects.toThrow('selection_required');
  await startEditorialIdea('owner', { ideaId: a.ids[0], expectedRevision: 1 });
  await expect(prepareSubmission('owner', { ...input, requestId: 'another-article-request' })).rejects.toThrow('identity_conflict');
  await expect(prepareSubmission('owner', { ...input, livProduction: { kind: 'scheduled', day: '2026-10-12' } })).rejects.toThrow('identity_conflict');
  const first = await prepareSubmission('owner', input);
  expect(first.id).toBe(ideaSubmissionId('owner', a.ids[0]));
  expect((await prepareSubmission('owner', input)).id).toBe(first.id);
  await expect(prepareSubmission('owner', { ...input, article: { ...input.article, title: 'Parallel omskrivning' } })).rejects.toThrow('idempotency_conflict');
  const edited = await updateSubmission('owner', { submissionId: first.id, expectedRevision: 1, requestId: 'edit-idea-article-01', article: { subtitle: 'Gemt undertitel' } });
  expect(edited.editorialIdeaId).toBe(a.ids[0]);
  const desk = await getEditorialDesk('owner', {});
  expect(desk.ideas[0].submission).toMatchObject({ id: first.id, revision: 2 }); expect(desk.drafts).toHaveLength(1);
});
it('bounds batches and transparently reports partial inventory', async () => {
  await expect(saveEditorialIdeas('owner', { requestId: 'duplicate-idea-batch', ideas: [idea, idea] })).rejects.toThrow('duplicate_batch');
  await expect(saveEditorialIdeas('owner', { requestId: 'oversized-idea-batch', ideas: Array(6).fill(idea) })).rejects.toThrow();
  await saveEditorialIdeas('owner', { requestId: 'two-idea-batch-test', ideas: [idea, { ...idea, topicKey: 'film-ny-vinkel' }] });
  expect((await getEditorialDesk('owner', { limit: 1 })).coverage.ideasHaveMore).toBe(true);
});
it('keeps canonical editorial/submission workflow and safe declarative UI', () => {
  const flow = editorialWorkflow({ workflow: 'editorial' });
  expect(flow.instructions).toContain('get_editorial_context'); expect(flow.instructions).toContain('Ingen forhåndsstjerner');
  expect(flow.instructions).toContain('preview_submission'); expect(flow.publicationApproval).toBe(false);
  expect(editorialDeskWidgetHtml).toContain('Start denne idé'); expect(editorialDeskWidgetHtml).toContain('ui/message');
  expect(editorialDeskWidgetHtml).not.toMatch(/\.innerHTML\s*=|fetch\(|execute_publication|confirm_submission_action/);
});


it('keeps a news idea with its sources in retained history and refuses to start it', async () => {
  const original = { ...idea, suggestedKind: undefined, title: 'Soundvenue søger videopraktikant', angle: 'Et gammelt kulturbrancheforslag.' };
  const saved = await saveEditorialIdeas('owner', { requestId: 'retained-news-2026-10-27', ideas: [original] });
  const before = structuredClone([...memory.rows]);
  const desk = await getEditorialDesk('owner', {});
  expect(desk.ideas).toEqual([]); expect(desk.retainedIdeas[0].sources).toEqual(original.sources);
  await expect(startEditorialIdea('owner', { ideaId: saved.ids[0], expectedRevision: 1 })).rejects.toThrow('liv_idea_requires_review_or_guide_rebrief');
  expect([...memory.rows]).toEqual(before);
});
