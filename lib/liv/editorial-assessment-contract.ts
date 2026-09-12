import { z } from 'zod';
import { articleFingerprint, assessmentSchema } from '@/lib/factcheck/grounded';

const fieldText = z.string().max(40_000);
export const livEditorialFieldsSchema = z.object({
  title: fieldText, subtitle: fieldText.optional(), excerpt: fieldText.optional(),
  seoTitle: fieldText.optional(), seoDescription: fieldText.optional(), ratingReason: fieldText.optional(),
  intro: fieldText.optional(), content: fieldText,
}).strict();
export type LivEditorialFields = z.infer<typeof livEditorialFieldsSchema>;
export const LIV_EDITORIAL_FIELD_POLICY = 'liv-editorial-fields-v1';
const fieldOrder = ['title', 'subtitle', 'excerpt', 'seoTitle', 'seoDescription', 'ratingReason', 'intro', 'content'] as const;

/** Field labels are context, never exemptions. Require exact reconstruction of
 * the already-fingerprinted text; keep its original unit IDs and literal offsets. */
export function livEditorialFieldContext(articleText: string, value: unknown) {
  const input = livEditorialFieldsSchema.parse(value);
  const entries = fieldOrder.flatMap(name => input[name] ? [{ name, text: input[name]! }] : []);
  const joined = entries.map(field => field.text).join('\n\n');
  if (joined.trim() !== articleText.trim()) throw new Error('liv_editorial_fields_mismatch');
  const leading = joined.length - joined.trimStart().length;
  const length = articleText.trim().length;
  let offset = 0;
  const fields = entries.map(field => {
    const start = Math.max(0, Math.min(length, offset - leading));
    const end = Math.max(start, Math.min(length, offset + field.text.length - leading));
    offset += field.text.length + 2;
    return { name: field.name, start, end, text: articleText.trim().slice(start, end) };
  });
  const context = { policy: LIV_EDITORIAL_FIELD_POLICY, fields };
  return { ...context, hash: articleFingerprint(JSON.stringify(context)) };
}

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
  fieldContextHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
