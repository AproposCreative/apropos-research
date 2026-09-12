import { z } from 'zod';
import { articleFingerprint, assessmentSchema } from '@/lib/factcheck/grounded';

export const editorialVerdictSchema = z.object({
  verdict: z.enum(['approve', 'revise']),
  summary: z.string().trim().min(1).max(1600),
  checks: z.object({
    voice: z.boolean(), independentAngle: z.boolean(), sourceAttribution: z.boolean(),
    noInventedExperience: z.boolean(), coherence: z.boolean(),
  }),
  blockingIssues: z.array(z.object({
    kind: z.enum(['unsupported_thesis', 'incoherent_thesis', 'copied_structure', 'missing_attribution', 'invented_experience']),
    articleQuote: z.string().trim().min(5).max(1800),
    explanation: z.string().trim().min(20).max(1000),
  })).max(5),
});
export const livEditorialAssessmentSchema = assessmentSchema.extend({ editorial: editorialVerdictSchema });
const { $schema: _schemaVersion, ...schema } = z.toJSONSchema(livEditorialAssessmentSchema);
export const livEditorialResponseFormat = { type: 'json_schema' as const,
  json_schema: { name: 'liv_editorial_assessment_v1', strict: true, schema } };
export const editorialEvidenceSchema = editorialVerdictSchema.extend({
  version: z.literal('liv-editorial-v1'), articleHash: z.string().regex(/^[a-f0-9]{64}$/),
  voiceHash: z.string().regex(/^[a-f0-9]{64}$/), checkedAt: z.string().datetime(),
  assessmentId: z.string().regex(/^[a-f0-9]{64}$/),
});
export type LivEditorialEvidence = z.infer<typeof editorialEvidenceSchema>;

/** A separate, explicit verdict; a grounded complete flag cannot replace it. */
export function readLivEditorialEvidence(value: unknown, text: string, voiceHash: string): LivEditorialEvidence | undefined {
  const parsed = editorialEvidenceSchema.safeParse(value);
  if (!parsed.success || parsed.data.articleHash !== articleFingerprint(text) || parsed.data.voiceHash !== voiceHash) return undefined;
  if (parsed.data.blockingIssues.some(issue => !text.includes(issue.articleQuote))) return undefined;
  const age = Date.now() - Date.parse(parsed.data.checkedAt);
  return age >= 0 && age <= 900_000 ? parsed.data : undefined;
}

export function editorialVerdictPasses(value: LivEditorialEvidence): boolean {
  // Tone, pacing, humour, metaphors and optional polishing are advice, not
  // grounds for another paid rewrite or for stranding a source-verified draft.
  return value.blockingIssues.length === 0;
}
