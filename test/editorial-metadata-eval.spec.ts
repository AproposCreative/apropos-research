import { expect, it } from 'vitest';
import { readMetadataCases, compareMetadata, compareMetadataSet } from '@/lib/editorial/metadata-evaluation';
const cases = readMetadataCases();
const candidate = (row: typeof cases[number], proposed = row.original) => ({ caseId: row.caseId, sourceHash: row.sourceHash, proposed });

it.each(cases)('keeps archived baseline findings visible without inventing a quality pass: $caseId', source => {
  const report = compareMetadata(source, candidate(source));
  expect(report.regressions).toEqual([]); expect(report.after).toEqual(report.before);
  expect(report).toMatchObject({ changedFields: [], factualAccuracy: 'not_verified', humanQualityScore: null,
    publicationApproval: false, sourceVerifiedNow: false });
});
it.each(cases)('catches a damaged primary artist/work name: $caseId', source => {
  const proposed = { ...source.original, seoTitle: source.original.seoTitle.replaceAll(source.primaryTerm, 'Forkert navn') };
  expect(proposed.seoTitle).not.toBe(source.original.seoTitle);
  expect(compareMetadata(source, candidate(source, proposed)).regressions).toContainEqual(
    expect.objectContaining({ field: 'seoTitle', code: 'primary_name_missing' }));
});
it.each(cases)('flags a newly invented number for evidence review: $caseId', source => {
  const proposed = { ...source.original, metaDescription: source.original.metaDescription + ' 987654321 gæster.' };
  expect(compareMetadata(source, candidate(source, proposed)).regressions).toContainEqual(
    expect.objectContaining({ field: 'metaDescription', code: 'new_number_requires_evidence', detail: '987654321' }));
});
it.each(cases)('catches generic English prompt leakage without claiming to grade all Danish: $caseId', source => {
  const proposed = { ...source.original, metaDescription: 'Unlock the secrets: ' + source.original.metaDescription };
  expect(compareMetadata(source, candidate(source, proposed)).regressions).toContainEqual(
    expect.objectContaining({ code: 'forbidden_phrase', detail: 'unlock the secrets' }));
});
it.each(cases)('catches increased metadata length even when the archive is already too long: $caseId', source => {
  const proposed = { ...source.original, seoTitle: source.original.seoTitle + ' ekstra'.repeat(50) };
  expect(compareMetadata(source, candidate(source, proposed)).regressions).toContainEqual(
    expect.objectContaining({ field: 'seoTitle', code: 'length_exceeded' }));
});
it('requires the exact trusted source snapshot and complete 20-case coverage', () => {
  const input = cases.map(row => candidate(row));
  expect(compareMetadataSet(cases, input)).toMatchObject({ totalCases: 20, changedCases: 0,
    regressionCases: 0, humanScoredCases: 0, paidAiCalls: 0, publicationApproval: false });
  expect(() => compareMetadataSet(cases, input.slice(1))).toThrow();
  expect(() => compareMetadataSet(cases, [input[0], ...input.slice(0, 19)])).toThrow('duplicate_candidate');
  expect(() => compareMetadata(cases[0], { ...input[0], sourceHash: '0'.repeat(64) })).toThrow('source_version_conflict');
  expect(() => compareMetadata(cases[0], { ...input[0], source: { title: 'Fake evidence' } })).toThrow();
  expect(() => compareMetadata(cases[0], { ...input[0], proposed: { ...input[0].proposed, score: 5 } })).toThrow();
});
it('never interprets a name fragment, new prose or fewer rule flags as verified improvement', () => {
  const source = cases[0];
  const report = compareMetadata(source, candidate(source, { ...source.original, seoTitle: source.primaryTerm + 'istik' }));
  expect(report.regressions.some(row => row.code === 'primary_name_missing')).toBe(true);
  expect(report.semanticReview).toHaveLength(1);
  expect(report.semanticReview[0]).toMatchObject({ before: source.original.seoTitle, after: source.primaryTerm + 'istik' });
  expect(report.publicationApproval).toBe(false); expect(report.humanQualityScore).toBeNull();
});
it('reports damaged Danish characters, em dashes and HTML in SEO text', () => {
  const source = cases[0], report = compareMetadata(source, candidate(source, { ...source.original,
    metaDescription: `${source.primaryTerm} — <b>Ã¸delagt</b>` }));
  expect(report.regressions.map(row => row.code)).toEqual(expect.arrayContaining([
    'damaged_danish_characters', 'em_dash', 'html_in_metadata',
  ]));
});
