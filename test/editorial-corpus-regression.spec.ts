import { expect, it } from 'vitest';
import { readCalibrationCases } from '@/lib/editorial/calibration-cases';
import { evaluateQualitySet, qualityTextHash } from '@/lib/editorial/quality-evaluation';
import { draftDiagnostics } from '@/lib/editorial/draft-diagnostics';
import { previewCopyedit } from '@/lib/editorial/copyedit';
const cases = readCalibrationCases();
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
it.each(cases)('preserves all unrequested prose, names and images for $id', source => {
  const originalHash = qualityTextHash(source);
  const article = { title: source.title, intro: source.intro, seoTitle: source.title,
    content: `<p>${escape(source.bodyText)}</p><figure><img src="https://example.com/preserved.jpg" alt="Bevar"><figcaption>Foto: Test</figcaption></figure>` };
  // Mechanical fixture, not a new editorial headline or a human quality score.
  const changed = previewCopyedit(article, [{ field: 'seoTitle', before: article.seoTitle, after: `${article.seoTitle} · test` }]);
  expect(changed.article.content).toBe(article.content); expect(changed.article.title).toBe(source.title);
  expect(changed.article.intro).toBe(source.intro); expect(changed.publicationApproval).toBe(false);
  const diagnostic = draftDiagnostics(article);
  expect(diagnostic.publicationApproval).toBe(false); expect(diagnostic.factCheck).toBe('not_performed');
  expect(qualityTextHash(source)).toBe(originalHash);
});
it('keeps zero invented human ratings across the full saved corpus', () => {
  expect(evaluateQualitySet(cases)).toMatchObject({ totalCases: 35, scoredCases: 0, kind: 'calibration-not-holdout', publicationApproval: false });
});
