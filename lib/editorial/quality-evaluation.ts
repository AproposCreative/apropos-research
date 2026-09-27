import { createHash } from 'node:crypto';
import { z } from 'zod';

export const editorialRubric = {
  voice: 'Apropos-stemme: konkret, selvstændig, menneskelig og holdningsbåret. Humor skal bære en pointe.',
  facts: 'Fakta: efterprøvelige navne, datoer og hændelser; adskil analyse og attribueret kritik. Ingen opdigtede oplevelser.',
  structure: 'Struktur: tydeligt emne, forståelig åbning, én tese, fremdrift, modargument og en afslutning der lander.',
  publishability: 'Publicerbarhed: samlet redaktionelt arbejde før udgivelse; passende længde, klar titel og begrundet anmeldelsesdom.',
} as const;
export const qualityCaseSchema = z.object({
  id: z.string().min(1), kind: z.enum(['published-reference', 'problematic-draft']),
  title: z.string().min(1), intro: z.string(), bodyText: z.string().min(100),
}).passthrough();
export type QualityCase = z.infer<typeof qualityCaseSchema>;
const score = z.number().int().min(1).max(5);
export const humanScoreSchema = z.object({
  caseId: z.string(), textHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewer: z.enum(['frederik@aproposmagazine.com', 'casper@aproposmagazine.com', 'milo@aproposmagazine.com']),
  reviewedAt: z.iso.datetime(), source: z.literal('human'),
  scores: z.object({ voice: score, facts: score, structure: score, publishability: score }).strict(),
  publishDecision: z.enum(['publish', 'minor-edit', 'rewrite', 'reject']), notes: z.string().trim().min(10),
}).strict();
export function qualityTextHash(article: QualityCase) {
  return createHash('sha256').update(JSON.stringify([article.title, article.intro, article.bodyText])).digest('hex');
}

/** Offline diagnostics, never an AI judge or publication grant. Human scores
 * bind to the exact text. Published and machine-blocked are not quality labels. */
export function evaluateQualitySet(input: unknown[], rawScores: unknown[] = []) {
  const cases = input.map(value => qualityCaseSchema.parse(value));
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw Error('quality_duplicate_case');
  const scores = rawScores.map(value => humanScoreSchema.parse(value));
  const unique = new Set<string>();
  for (const score of scores) {
    const article = cases.find(c => c.id === score.caseId);
    if (!article || qualityTextHash(article) !== score.textHash) throw Error('quality_score_text_mismatch');
    const key = `${score.caseId}:${score.reviewer}`;
    if (unique.has(key)) throw Error('quality_duplicate_score');
    unique.add(key);
  }
  const rows = cases.map(article => ({ id: article.id, kind: article.kind, title: article.title,
    textHash: qualityTextHash(article), bodyWords: article.bodyText.trim().split(/\s+/u).length,
    // Flags guide review. They are not subjective quality scores or hard rejections.
    reviewFlags: [
      ...(article.bodyText.includes('—') ? ['em-dash'] : []),
      ...(/\b(?:Det interessante er|Det er værd at bemærke|I en tid hvor)\b/i.test(article.bodyText) ? ['stock-phrase'] : []),
    ],
    humanScores: scores.filter(s => s.caseId === article.id),
  }));
  const scoredCases = rows.filter(r => r.humanScores.length > 0).length;
  return { version: 'apropos-quality-report-v1', rubric: editorialRubric,
    kind: 'calibration-not-holdout', totalCases: rows.length, scoredCases,
    status: scoredCases === rows.length && rows.length > 0 ? 'human-scored' : 'awaiting-human-review',
    publicationApproval: false, rows };
}
