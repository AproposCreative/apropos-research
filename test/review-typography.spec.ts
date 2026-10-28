import { expect, it } from 'vitest';
import { containsLongDash, reviewLongDashFields } from '@/lib/editorial/review-typography';
import { inspectSubmission, submissionInput } from '@/lib/editorial/submission-contract';
import { checkCmsDraft } from '@/lib/editorial/cms-preflight';
import { draftDiagnostics } from '@/lib/editorial/draft-diagnostics';

it.each(['–', '—', '&ndash;', '&mdash;', '&#8211;', '&#x2014;'])('detects the visible forbidden dash %s, including encoded HTML', dash => {
  expect(containsLongDash(`<p>En bog ${dash} og et hjem</p>`)).toBe(true);
  expect(reviewLongDashFields({ title: `Boganmeldelse: Nogen der kender nogen ${dash} hvem har råd til et hjem?` })).toEqual(['title']);
});
it('preserves normal hyphens and ignores URL punctuation, but checks captions and alt text', () => {
  expect(reviewLongDashFields({ title: 'Science-fiction', content: '<p>4-6 stjerner</p><img src="https://example.org/a–b.png">' })).toEqual([]);
  expect(reviewLongDashFields({ content: '<figure><img src="https://example.org/a.png" alt="En bog &mdash; på et bord"><figcaption>Bog</figcaption></figure>' })).toEqual(['content']);
  expect(reviewLongDashFields({ content: '<figcaption>Et hjem – måske</figcaption>' })).toEqual(['content']);
});
it('blocks a ChatGPT-first human-review submission before preparation and gives the exact fields', () => {
  const input = submissionInput.parse({ requestId: 'review-no-dash-test-01', article: { title: 'Boganmeldelse: Test', content: '<p>Tekst.</p>', seoTitle: 'Test – anmeldelse' }, choices: { kind: 'review', aiFinalChecks: 'human' } });
  const result = inspectSubmission(input, { authors: [], categories: [], topics: [], requiredFields: [], checkedAt: '2026-10-28T00:00:00Z' });
  expect(result.blockers).toContain('review_long_dash_forbidden');
  expect(result.typographyFields).toEqual(['seoTitle']);
  expect(result.readyForPreparation).toBe(false);
  expect(input.article.seoTitle).toBe('Test – anmeldelse');
  expect(inspectSubmission({ ...input, status: 'published' }, { authors: [], categories: [], topics: [], requiredFields: [], checkedAt: '' }).blockers).not.toContain('review_long_dash_forbidden');
});
it('checks metadata, social copy and Writer diagnostics as well as content', () => {
  const article = { title: 'Boganmeldelse: Test', content: '<p>God tekst.</p>', rating: 4, seoDescription: 'En bog — en dom', socialSubtitles: { square: 'En bog – et liv', story: 'Et liv.' } };
  expect(reviewLongDashFields(article)).toEqual(['seoDescription', 'socialSubtitles.square']);
  expect(checkCmsDraft(article as any).checks.find(c => c.id === 'style')?.ok).toBe(false);
  expect(draftDiagnostics(article).findings.filter(f => f.code === 'review_long_dash_forbidden').map(f => f.field)).toEqual(['seoDescription', 'socialSubtitles.square']);
});
