import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
import { inspectSubmission, submissionInput } from '@/lib/editorial/submission-contract';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
const options = { authors: [{ id: 'a'.repeat(24), name: 'Frederik Kragh' }, { id: 'd'.repeat(24), name: 'Liv Brandt' }], categories: [{ id: 'b'.repeat(24), name: 'Kultur' }],
  topics: [{ id: 'c'.repeat(24), name: 'Film' }], requiredFields: ['name'], checkedAt: '2026-10-05T00:00:00Z' };
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => options }));
import { prepareSubmission, updateSubmission, getSubmissionStatus } from '@/lib/editorial/submissions';
import { submissionVersion } from '@/lib/editorial/submission-contract';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { approvedSubmissionPolicy } from '@/lib/editorial/submission-policy';
import { registerReaderSource, saveReaderProgress } from '@/lib/mcp/reader';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => { memory = memoryFirestore(); state.db = memory.db; });
const input = () => submissionInput.parse({ requestId: 'article-from-chat-0001', article: { title: 'En anmeldelse', content: '<p>Min egen tekst.</p>' } });

async function bookFixture(complete = true) {
  const source = await registerReaderSource('owner', {
    sourceUrl: 'https://bibliotek.kk.dk/reader?orderid=00000000-0000-4000-8000-000000000001',
    title: 'Testroman', author: 'Testforfatter',
  });
  await saveReaderProgress('owner', { sourceId: source.sourceId, requestId: 'test-book-reading-01', expectedRevision: 0,
    access: 'available', observedAt: '2026-10-06T18:00:00.000Z', layout: { key: 'test-layout-1200x800', totalPositions: 6 },
    checkpoint: { position: complete ? 6 : 3, chapter: '1', anchor: 'Kort testanker.' },
    readRanges: [{ start: 1, end: complete ? 6 : 3, chapter: '1' }], beginningObserved: true, endObserved: complete,
    notes: 'Egne positionsbundne noter om karakterernes udvikling og romanens åbne slutning.' });
  return { ...input(), readerSourceId: source.sourceId, article: { ...input().article, title: 'Anmeldelse: Testroman',
    author: options.authors[1].id, category: options.categories[0].id, subjectType: 'literature', articleFormat: 'research-review',
    rating: 4, ratingReason: 'Romanens form understøtter karakterernes udvikling.', subtitle: 'Undertitel', intro: 'Introduktion',
    slug: 'testroman', seoTitle: 'Testroman anmeldelse', seoDescription: 'En anmeldelse baseret på læsning af romanen.' },
    choices: { kind: 'review', media: 'provided', aiFinalChecks: 'human' }, research: [] };
}

it('accepts actual complete saved book reading as Liv’s review basis, while preserving AI label and personal consent', async () => {
  const value = await bookFixture();
  const row = await withoutPaidAi(() => prepareSubmission('owner', value));
  expect(row).toMatchObject({ reviewBasis: 'completed_book_reading', textReadyForPreparation: true,
    article: { bookTitle: 'Testroman', bookAuthor: 'Testforfatter', aiGenerated: true }, publicationReady: false,
    readerEvidence: { sourceId: value.readerSourceId, title: 'Testroman', author: 'Testforfatter',
      basis: 'saved_position_bound_notes', independentlyVerified: false, publicationApproval: false } });
  expect(row.blockers).not.toContain('liv_five_original_reviews_required');
  expect(() => approvedSubmissionPolicy({ ...row, status: 'draft' })).toThrow('editorial_decision_required');
  expect(await prepareSubmission('owner', value)).toMatchObject({ id: row.id, revision: 1 });
  const edited = await updateSubmission('owner', { submissionId: row.id, expectedRevision: 1,
    requestId: 'test-book-copy-edit', article: { intro: 'En præcis introduktion.' } });
  expect(edited).toMatchObject({ reviewBasis: 'completed_book_reading', revision: 2, publicationReady: false });
  await expect(updateSubmission('owner', { submissionId: row.id, expectedRevision: 2,
    requestId: 'test-book-wrong-title', article: { bookTitle: 'En helt anden bog' } })).rejects.toThrow('reader_identity_conflict');
});
it('does not let an incomplete book, another owner’s book or injected evidence waive review requirements', async () => {
  const value = await bookFixture(false);
  await expect(prepareSubmission('owner', value)).rejects.toThrow('reader_incomplete');
  await expect(prepareSubmission('other', value)).rejects.toThrow('reader_not_found');
  await expect(prepareSubmission('owner', { ...value, readerEvidence: { complete: true } })).rejects.toThrow();
  expect(inspectSubmission(submissionInput.parse(value), options).blockers).toContain('liv_five_original_reviews_required');
});
it('honours historical server reading snapshots but never reuses book coverage for a different work or medium', async () => {
  const row = await prepareSubmission('owner', await bookFixture());
  const { title: _title, author: _author, ...legacy } = row.readerEvidence!;
  expect(inspectSubmission({ ...row, readerEvidence: legacy }, options).reviewBasis).toBe('completed_book_reading');
  for (const article of [{ ...row.article, subjectType: 'film' }, { ...row.article, bookAuthor: 'Anden forfatter' }]) {
    expect(inspectSubmission({ ...row, article }, options).blockers).toContain('liv_five_original_reviews_required');
  }
  for (const coverage of row.readerEvidence!.coverage.map(c => ({ ...c, endObserved: false }))) {
    expect(inspectSubmission({ ...row, readerEvidence: { ...row.readerEvidence!, coverage: [coverage] } }, options).blockers)
      .toContain('liv_five_original_reviews_required');
  }
});

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
it('does not send a human-check press draft to price acceptance while images are missing', async () => {
  const article = { ...input().article, author: options.authors[0].id, category: options.categories[0].id, subjectType: 'culture',
    subtitle: 'En undertitel', intro: 'En intro', slug: 'en-artikel', seoTitle: 'En titel', seoDescription: 'En beskrivelse' };
  const result = await prepareSubmission('owner', { ...input(), article, choices: { kind: 'feature', media: 'press', aiFinalChecks: 'human' } });
  expect(result).toMatchObject({ textReadyForPreparation: true, readyForPreparation: false, missingMedia: ['cover', 'body-1', 'body-2'],
    handoff: { nextAction: 'find_and_import_missing_press_images' } });
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
it('new edits preserve historical consent but clear its pending marker for the new version', async () => {
  const first = await prepareSubmission('owner', input()), path = `editorialSubmissions/${first.id}`;
  const consent = { uid: 'owner', revision: 1, contentHash: first.contentHash, id: 'old' };
  Object.assign(memory.rows.get(path), { publicationConsent: consent, publicationConsentPending: true });
  const next = await updateSubmission('owner', { submissionId: first.id, expectedRevision: 1, requestId: 'edit-consented-title', article: { title: 'Ny titel' } });
  expect(next).toMatchObject({ revision: 2, publicationConsentPending: false, approvalState: 'approval_required' });
  expect(memory.rows.get(path).publicationConsent).toEqual(consent);
  expect(memory.rows.get(`${path}/versions/1`)).toMatchObject({ publicationConsent: consent, publicationConsentPending: true });
});

it('saves ChatGPT SoMe variants in the existing submission with replay, revision and immutable history', async () => {
  const copy = { square: 'En kort vurdering.', story: 'En lidt længere vurdering.' };
  const value = { ...input(), article: { ...input().article, subtitle: 'En vurdering af kultur.', socialSubtitles: copy } };
  const first = await prepareSubmission('owner', value);
  expect(first.article.socialSubtitles).toEqual(copy);
  expect((await prepareSubmission('owner', value)).revision).toBe(1);
  const update = { submissionId: first.id, expectedRevision: 1, requestId: 'some-metadata-0001', article: { seoTitle: 'Ny SEO-titel' } };
  const second = await updateSubmission('owner', update);
  expect(second.article.socialSubtitles).toEqual(copy);
  expect((await updateSubmission('owner', update)).revision).toBe(2);
  await expect(updateSubmission('owner', { ...update, requestId: 'some-metadata-0002' })).rejects.toThrow('revision_conflict');
  const third = await updateSubmission('owner', { ...update, expectedRevision: 2, requestId: 'some-title-change-01', article: { title: 'Ændret vinkel' } });
  expect(third.article.socialSubtitles).toBeUndefined();
  expect(third.originalArticle.socialSubtitles).toEqual(copy);
  expect(third.article.content).toBe(first.article.content);
  expect(third.paidAiCalls).toBe(0); expect(third.publicationReady).toBe(false);
  expect(memory.rows.get(`editorialSubmissions/${first.id}/versions/2`).article.socialSubtitles).toEqual(copy);
});


it('normalises a new Liv research review to visible AI before hashing, without losing idempotency or altering old history', async () => {
  const value = input(); value.article.author = options.authors[1].id;
  value.article.articleFormat = 'research-review'; value.choices.kind = 'review';
  const first = await prepareSubmission('owner', value);
  const row = memory.rows.get(`editorialSubmissions/${first.id}`)!;
  expect(row.article.aiGenerated).toBe(true);
  expect(row.contentHash).toBe(submissionVersion({ ...value, choices: { ...value.choices, aiFinalChecks: 'human' }, article: row.article }));
  expect((await prepareSubmission('owner', value)).id).toBe(first.id);
  expect(memory.rows.get(`editorialSubmissions/${first.id}`)!.revision).toBe(1);
  const next = await updateSubmission('owner', { submissionId: first.id, expectedRevision: 1, requestId: 'liv-label-update-0001', article: { subtitle: 'En ny undertekst' } });
  expect(next.article.aiGenerated).toBe(true);
  expect(next.revision).toBe(2);
});
