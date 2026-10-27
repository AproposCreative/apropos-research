import { expect, it } from 'vitest';
import { assessLivTopic, livReviewSourceEvidence, LIV_EDITORIAL_REMIT } from '@/lib/liv/editorial-remit';
import { inspectSubmission, submissionInput } from '@/lib/editorial/submission-contract';
import { consentArticleHash } from '@/lib/editorial/submission-consent';
import { defaultEditorialPlan } from '@/lib/liv/rolling-plan';
import { loadLivVoice } from '@/lib/liv/voice';
import { articleReadingPreview } from '@/lib/editorial/submission-preview';

it.each(['Soundvenue søger videopraktikant', 'SNL-krig er brudt ud efter en monolog',
  'The Strokes spiller på dansk festival næste år', 'Ed Sheerans koncerter er aflyst'])('excludes historical news seeds despite cultural tags: %s', title => {
  expect(assessLivTopic({ title, tags: ['musik', 'kultur', 'kvinder', 'anmeldelser'] }).eligible).toBe(false);
});
it.each(['Anmeldelse: Saveus i Royal Arena', 'Anmeldelse: Silo sæson 3', 'Anmeldelse: En roman',
  'Anmeldelse: Remedios Varo på Louisiana', 'Kulturguide: København med børn'])('accepts the requested formats: %s', title => {
  expect(assessLivTopic({ title }).eligible).toBe(true);
});
it('does not misrepresent preserved commentary or a sales feature as a review', () => {
  expect(assessLivTopic({ title: 'Hvorfor holder vi stadig med Walter White?', kind: 'commentary', articleFormat: 'article' }).eligible).toBe(false);
  expect(assessLivTopic({ title: 'Christopher har solgt 60.000 billetter', kind: 'feature' }).eligible).toBe(false);
  expect(assessLivTopic({ title: 'Louisiana med børn', kind: 'culture-guide' }).format).toBe('culture-guide');
});
const research = Array.from({ length: 6 }, (_, i) => ({ kind: 'review' as const, url: `https://critic${i}.example/review`,
  title: 'Originalanmeldelse af samme værk', retrievedAt: '2026-10-27T18:00:00.000Z', publishedAt: null,
  notes: 'En faktisk læst anmeldelse med konkrete noter om værkets styrker, svagheder og argumentation, som skal sammenholdes med de andre.' }));
it('counts original reviews, not snippets, duplicate URLs, official pages or repeated hosts', () => {
  expect(livReviewSourceEvidence(research).sufficient).toBe(true);
  expect(livReviewSourceEvidence(research.slice(0, 4)).sufficient).toBe(false);
  expect(livReviewSourceEvidence(research.map(r => ({ ...r, kind: 'official' }))).sufficient).toBe(false);
  expect(livReviewSourceEvidence(research.map((r, i) => ({ ...r, url: `https://one.example/${i}` }))).sufficient).toBe(false);
  expect(livReviewSourceEvidence(research.map(r => ({ ...r, url: research[0].url + '?utm_source=test' }))).reviewCount).toBe(1);
  expect(livReviewSourceEvidence(research.map(r => ({ ...r, notes: 'Snippet' }))).sufficient).toBe(false);
});
const options = { authors: [{ id: 'liv-cms-id', name: 'Liv Brandt' }, { id: 'frederik-id', name: 'Frederik Kragh' }],
  categories: [{ id: 'film', name: 'Film' }], topics: [], requiredFields: [], checkedAt: '' };
const review = () => submissionInput.parse({ requestId: 'research-review-test-01', article: {
  title: 'Anmeldelse: Et værk', content: '<p>AI-skrevet vurdering på baggrund af originalanmeldelser.</p>',
  author: 'liv-cms-id', category: 'film', subjectType: 'film', articleFormat: 'research-review',
  rating: 4, ratingReason: 'En konkret og velbegrundet vurdering af værkets form.', aiGenerated: true,
  subtitle: 'Undertitel', intro: 'Introduktion', slug: 'et-vaerk', seoTitle: 'Et værk anmeldelse', seoDescription: 'En anmeldelse af værket.' },
  choices: { kind: 'review', media: 'press' }, research });
it('permits research reviews without firsthand viewing and still checks source coverage and AI label', () => {
  expect(inspectSubmission(review(), options).blockers).toEqual([]);
  const sparse = review(); sparse.research = research.slice(0, 2);
  expect(inspectSubmission(sparse, options).blockers).toContain('liv_five_original_reviews_required');
  const hidden = review(); hidden.article.aiGenerated = false;
  expect(inspectSubmission(hidden, options).blockers).toContain('liv_public_ai_label_required');
  expect(inspectSubmission({ ...hidden, status: 'published' }, options).blockers).not.toContain('liv_public_ai_label_required');
});
it('does not impose Liv source requirements on another writer', () => {
  const input = review(); input.article.author = 'frederik-id'; input.article.aiGenerated = false; input.research = [];
  expect(inspectSubmission(input, options).blockers).toEqual([]);
});
it('binds the public AI marking to consent and exposes it in the preview', () => {
  const article = review().article;
  expect(consentArticleHash(article, 'review')).not.toBe(consentArticleHash({ ...article, aiGenerated: false }, 'review'));
  expect(articleReadingPreview(article).aiGenerated).toBe(true);
});
it('supplies one current directive to default planning and preserves old voice versions', () => {
  expect(defaultEditorialPlan('2026-10-28').directiveHint).toContain(LIV_EDITORIAL_REMIT.instruction);
  expect(defaultEditorialPlan('2026-10-28', true).directiveHint).toContain('Reserve');
  expect(loadLivVoice().version).toBe('liv-v6');
  expect(loadLivVoice('liv-v5').version).toBe('liv-v5');
  expect(loadLivVoice().text).toContain('Manglende eget besøg er ikke en grund');
});


it('offers Liv only the two allowed editorial formats, without changing other authors choices', () => {
  const input = review(); input.article.articleFormat = 'article'; input.choices.kind = undefined;
  expect(inspectSubmission(input, options).questions.find(q => q.field === 'kind')?.options?.map(o => o.value)).toEqual(['review', 'culture-guide']);
});
