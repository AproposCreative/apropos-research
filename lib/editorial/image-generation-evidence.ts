import { createHash } from 'node:crypto';
import { z } from 'zod';

export const IMAGE_HANDOFF_VERSION = 'canonical-native-image-v2';
export const IMAGE_HANDOFF_INSTRUCTION = 'MANDATORY: Before each generation or edit, call get_image_brief for this exact submission, revision, role and section. If the brief or any actual reference image is missing, STOP and report the missing dependency. Pass the returned canonical prompt and ALL attached reference images unchanged to the native image-generation tool, in the given order. Do not summarize, rewrite, embellish or reinterpret the visual style, or append a prompt wrapper. When the user requests uploaded subject photos, retain them with store_submission_image_reference and include their referenceIds in get_image_brief; never substitute a description for the actual photo. Generate the cover and each body illustration in separate calls: one standalone illustration per brief, no collage, layout, article mockup, text, headings, logos or watermark. Inspect the actual output before import and report that inspection bound to its SHA-256, exact prompt and reference hashes. Report only observed facts; never reconstruct missing generation evidence. Show the image in chat and import that same original file with the exact submissionId, briefId and sectionId. Preserve files and receipts after timeout; never regenerate to repair transfer. No backend image API, automatic approval, publication or replacement of approved images. A client report does not independently verify the native tool’s hidden input.';
export const promptHash = (prompt: string) => createHash('sha256').update(prompt, 'utf8').digest('hex');
export const generationReportInput = z.object({
  effectivePrompt: z.string().min(1).max(20000).describe('Exact canonical full prompt actually sent to the native image tool, unchanged. Never reconstruct it afterwards.'),
  referenceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(8).describe('Hashes of references reportedly supplied. Include the brief’s actual style-reference image.'),
  technicalWrapper: z.string().max(2000).optional().describe('Historical receipts only. A nonempty wrapper is rejected for new generations.'),
  outputCheck: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    inspected: z.boolean(),
    imageType: z.enum(['standalone-illustration', 'photo', 'collage', 'article-mockup', 'other']),
    singleImage: z.boolean(), textVisible: z.boolean(), logosVisible: z.boolean(), watermarkVisible: z.boolean(),
  }).strict().optional().describe('Required for new generated/edited images. Inspect the real output first; this is an agent report, not a personal approval or server visual verification.'),
}).strict();

/** Fail closed for NEW imports. Historical receipts remain readable; missing
 * evidence is never manufactured retroactively to upgrade an old asset. */
export function assertGenerationContract(input: { kind: string; origin: string; briefId?: string;
  submissionId: string; expectedRevision: number; role: string; sectionId?: string;
  generationReport?: z.infer<typeof generationReportInput> }, brief: Record<string, any> | null | undefined) {
  const generated = ['chatgpt-generated', 'chatgpt-edited'].includes(input.origin);
  if (!generated && input.kind === 'photo' && ['user-upload', 'press-source'].includes(input.origin)) {
    if (input.briefId || input.generationReport) throw Error('mcp_submission_image_origin_conflict');
    return;
  }
  if (!generated) throw Error('mcp_submission_image_origin_required');
  if (input.kind !== 'illustration') throw Error('mcp_submission_generated_image_type_invalid');
  if (!input.briefId) throw Error('mcp_submission_brief_required');
  if (!brief || brief.handoffVersion !== IMAGE_HANDOFF_VERSION || brief.submissionId !== input.submissionId ||
      brief.expectedRevision !== input.expectedRevision || brief.role !== input.role || brief.sectionId !== input.sectionId ||
      !brief.prompt || brief.canonicalPromptHash !== promptHash(brief.prompt)) throw Error('mcp_submission_generation_brief_invalid');
  if (!brief.referenceHash || !Array.isArray(brief.requiredReferenceHashes) || !brief.requiredReferenceHashes.length ||
      brief.requiredReferenceHashes[0] !== brief.referenceHash) throw Error('mcp_submission_style_reference_required');
  if ((input.origin === 'chatgpt-edited') !== !!brief.parentAssetId) throw Error('mcp_submission_parent_required');
  const report = input.generationReport;
  if (!report) throw Error('mcp_submission_generation_report_required');
  if (report.effectivePrompt !== brief.prompt || report.technicalWrapper) throw Error('mcp_submission_canonical_prompt_mismatch');
  if (JSON.stringify(report.referenceHashes) !== JSON.stringify(brief.requiredReferenceHashes)) throw Error('mcp_submission_generation_references_mismatch');
  const check = report.outputCheck;
  if (!check?.inspected) throw Error('mcp_submission_output_inspection_required');
  if (check.imageType !== 'standalone-illustration' || !check.singleImage || check.textVisible || check.logosVisible || check.watermarkVisible)
    throw Error('mcp_submission_generated_image_type_invalid');
}
export type GenerationEvidence = {
  version: typeof IMAGE_HANDOFF_VERSION;
  status: 'not_applicable' | 'not_supplied' | 'client_reported_match' | 'mismatch';
  canonicalPromptHash: string | null; effectivePromptHash: string | null;
  referenceHash: string | null; reportedReferenceHashes: string[];
  technicalWrapperHash: string | null; requiresPersonalSelection: boolean;
  exactPromptExecutionVerified: false; reasons: string[];
};

/** Compare exact UTF-8 input, not a word blacklist: canonical negatives and
 * quoted article text legitimately contain words like “photorealism” or “3D”.
 * A client report is not independent observation of the native generator. */
export function imageGenerationEvidence(input: { kind: string; origin: string; briefId?: string;
  generationReport?: z.infer<typeof generationReportInput> }, brief?: { prompt?: string; referenceHash?: string } | null): GenerationEvidence {
  const relevant = input.kind === 'illustration' && (!!input.briefId || ['chatgpt-generated', 'chatgpt-edited'].includes(input.origin));
  const report = input.generationReport;
  const canonical = brief?.prompt ? promptHash(brief.prompt) : null;
  const effective = report ? promptHash(report.effectivePrompt) : null;
  const reasons: string[] = [];
  if (relevant) {
    if (!report) reasons.push('generation_report_missing');
    if (!canonical || !brief?.referenceHash) reasons.push('legacy_brief_without_contract');
    if (report && canonical !== effective) reasons.push('canonical_prompt_mismatch');
    if (report && (!brief?.referenceHash || !report.referenceHashes.includes(brief.referenceHash))) reasons.push('style_reference_not_reported');
    if (report?.technicalWrapper) reasons.push('technical_wrapper_requires_review');
  }
  const status = !relevant ? 'not_applicable' : !report ? 'not_supplied' : reasons.length ? 'mismatch' : 'client_reported_match';
  return { version: IMAGE_HANDOFF_VERSION, status, canonicalPromptHash: canonical, effectivePromptHash: effective,
    referenceHash: brief?.referenceHash || null, reportedReferenceHashes: report?.referenceHashes || [],
    technicalWrapperHash: report?.technicalWrapper ? promptHash(report.technicalWrapper) : null,
    requiresPersonalSelection: relevant && status !== 'client_reported_match', exactPromptExecutionVerified: false, reasons };
}
