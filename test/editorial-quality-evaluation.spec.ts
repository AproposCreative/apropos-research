import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluateQualitySet, qualityTextHash } from '@/lib/editorial/quality-evaluation';
const article = { id: 'case-1', kind: 'problematic-draft' as const, title: 'Konkret titel', intro: 'En klar åbning', bodyText: 'En tekst med konkrete observationer. '.repeat(8) };
const rating = { caseId: article.id, textHash: qualityTextHash(article),
  reviewer: 'frederik@aproposmagazine.com', reviewedAt: '2026-09-27T10:00:00.000Z', source: 'human',
  scores: { voice: 3, facts: 4, structure: 3, publishability: 3 }, publishDecision: 'minor-edit', notes: 'Test fixture, not a real editorial rating.' };
it('does not invent editorial approval or quality from source labels', () => {
  expect(evaluateQualitySet([article])).toMatchObject({ status: 'awaiting-human-review', scoredCases: 0, publicationApproval: false });
});
it('binds declared human ratings to an exact text without granting publication', () => {
  expect(evaluateQualitySet([article], [rating])).toMatchObject({ status: 'human-scored', publicationApproval: false });
  expect(() => evaluateQualitySet([{ ...article, title: 'Changed' }], [rating])).toThrow('quality_score_text_mismatch');
  expect(() => evaluateQualitySet([article], [rating, rating])).toThrow('quality_duplicate_score');
  expect(() => evaluateQualitySet([article], [{ ...rating, source: 'ai' }])).toThrow();
});
it('has 25 genuine archive references and ten retained blocked drafts, not fake human negatives', () => {
  const manifest = JSON.parse(readFileSync('data/editorial-evals/calibration-v1.json', 'utf8'));
  const archive = readFileSync('data/apropos-style-samples.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const refs = manifest.referenceIds.map((id: string) => ({ ...archive.find(a => a.id === id), kind: 'published-reference' }));
  const drafts = JSON.parse(readFileSync('data/editorial-evals/problematic-drafts-v1.json', 'utf8'));
  expect(refs).toHaveLength(25); expect(drafts).toHaveLength(10);
  const report = evaluateQualitySet([...refs.map((r: any) => ({ ...r, intro: r.intro || '' })), ...drafts]);
  expect(report).toMatchObject({ totalCases: 35, scoredCases: 0, status: 'awaiting-human-review' });
  expect(drafts.every((d: any) => !!d.origin.writingRunId && !!d.origin.observedFailure && d.humanScores === null)).toBe(true);
});
