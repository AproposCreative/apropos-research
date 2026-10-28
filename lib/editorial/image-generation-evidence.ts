import { createHash } from 'node:crypto';
import { z } from 'zod';
import { bookMockupBindingValid } from './book-mockup';

export const IMAGE_HANDOFF_VERSION = 'canonical-native-image-v3';
export const IMAGE_HANDOFF_INSTRUCTION = 'MANDATORY: Before each generation or edit, read get_submission_status and get_submission_media_context, get_image_brief for this exact submission/revision/role/section, then preflight_submission_image. For a first attempt, dispatch.state=first_attempt and no grant/claim is required; dispatch is a grant only for a retry after a failed or declined image. If canGenerate=false or any actual reference is unavailable to the native host, STOP before generation. A complete preflight permits one controlled attempt, not autonomous import or publication. Supply the complete canonical prompt and ALL actual reference images unchanged and ordered. Do not summarize, rewrite, embellish, translate or append wrappers. The host may receive them through explicit arguments or conversation context: report the actual mechanism; never pretend hidden generator input was inspected. STYLE_REFERENCE determines style; SUBJECT_REFERENCE is the original user photo, not a description. Store requested subject photos with store_submission_image_reference and bind IDs with subjectReferencesRequired=true. Cover and each body image require separate briefs and separate calls: one coherent standalone illustration, no collage, panels, mockup, typography, text, logos, watermark, photorealism, photo fragments or 3D. EXCEPTION: A saved cover-only book-mockup brief for literature requires retained original book-cover-artwork (and optional book-mockup-layout) references. Follow that canonical product prompt: original printed lettering and publisher marks ON the book and realistic product rendering are permitted; no text outside the book. Report imageType=book-mockup and inspect printedCoverPreserved, textOutsideBook and singleBook. This exception never applies to body images or standalone illustration briefs. Inspect the actual output; semantic judgments are agent-reported, not deterministic proof or personal approval. Never invent missing output evidence. import_submission_image stages valid generated originals privately; show preview_submission for the user to select the exact file before CMS upload/attachment. Rejected originals and receipts stay private. No automatic regeneration, altered prompt, new requestId or relabelling to bypass a failure. A new attempt requires an explicit human decision and resolved concrete blockers. Preserve text/metadata/history and approved images. Genuine user-uploaded or verified press PHOTOS remain importable without generation briefs. No paid backend AI, automatic approval or publication. Client hashes never prove hidden generator processing.';
export const promptHash = (prompt: string) => createHash('sha256').update(prompt, 'utf8').digest('hex');
// Delivery mechanism, not independent evidence of hidden native processing.
export const nativeImageInputMode = z.enum(['explicit_arguments', 'conversation_context']);
export const generationReportInput = z.object({
  effectivePrompt: z.string().min(1).max(20000).describe('Exact complete canonical prompt supplied unchanged to the native host. Never reconstruct it afterwards; hidden generator processing is not observable.'),
  inputMode: nativeImageInputMode.optional().describe('How the native host received the canonical text and actual reference images. Report the real mechanism, not inferred hidden arguments.'),
  referenceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(8).describe('Hashes of references reportedly supplied. Include the brief’s actual style-reference image.'),
  technicalWrapper: z.string().max(2000).optional().describe('Historical receipts only. A nonempty wrapper is rejected for new generations.'),
  outputCheck: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    inspected: z.boolean(),
    imageType: z.enum(['standalone-illustration', 'book-mockup', 'photo', 'collage', 'article-mockup', 'magazine-cover', 'split-panels', 'ui-design', '3d-render', 'other']),
    printedCoverPreserved: z.boolean().optional(), textOutsideBook: z.boolean().optional(), singleBook: z.boolean().optional(),
    singleImage: z.boolean(), textVisible: z.boolean(), logosVisible: z.boolean(), watermarkVisible: z.boolean(),
    photorealistic: z.boolean().optional(), photographicFragments: z.boolean().optional(), rendered3d: z.boolean().optional(),
    coherentScene: z.boolean().optional(), panelCount: z.number().int().min(0).max(100).optional(),
    styleMatch: z.enum(['match', 'mismatch', 'not_reviewed']).optional(),
    subjectMatch: z.enum(['match', 'mismatch', 'not_reviewed', 'not_applicable']).optional(),
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
  if (brief.output?.kind === 'book-mockup') {
    if (!bookMockupBindingValid(brief)) throw Error('mcp_submission_book_mockup_requires_original');
    if (check.imageType !== 'book-mockup' || !check.singleImage || check.watermarkVisible || check.photographicFragments === true ||
        check.coherentScene === false || (check.panelCount !== undefined && check.panelCount !== 1) || check.printedCoverPreserved === false ||
        check.textOutsideBook === true || check.singleBook === false || check.styleMatch === 'mismatch' || check.subjectMatch === 'mismatch')
      throw Error('mcp_submission_generated_image_type_invalid');
    if (check.printedCoverPreserved !== true || check.textOutsideBook !== false || check.singleBook !== true ||
        check.photographicFragments !== false || check.coherentScene !== true || check.panelCount !== 1 ||
        check.styleMatch !== 'match' || check.subjectMatch !== 'match') throw Error('mcp_submission_output_inspection_required');
    return;
  }
  if (check.imageType !== 'standalone-illustration' || !check.singleImage || check.textVisible || check.logosVisible || check.watermarkVisible)
    throw Error('mcp_submission_generated_image_type_invalid');
  if (check.photorealistic === true || check.photographicFragments === true || check.rendered3d === true || check.coherentScene === false ||
      (check.panelCount !== undefined && check.panelCount !== 1) || check.styleMatch === 'mismatch' || check.subjectMatch === 'mismatch')
    throw Error('mcp_submission_generated_image_type_invalid');
  if (check.photorealistic !== false || check.photographicFragments !== false || check.rendered3d !== false || check.coherentScene !== true ||
      check.panelCount !== 1 || check.styleMatch !== 'match' ||
      (brief.subjectReferencesRequired || brief.subjectReferenceIds?.length ? check.subjectMatch !== 'match' : !['match', 'not_applicable'].includes(check.subjectMatch || '')))
    throw Error('mcp_submission_output_inspection_required');
}
export type GenerationEvidence = {
  version: typeof IMAGE_HANDOFF_VERSION;
  status: 'not_applicable' | 'not_supplied' | 'client_reported_match' | 'mismatch';
  canonicalPromptHash: string | null; effectivePromptHash: string | null;
  referenceHash: string | null; reportedReferenceHashes: string[];
  technicalWrapperHash: string | null; requiresPersonalSelection: boolean;
  exactPromptExecutionVerified: false; reasons: string[];
  inputMode: 'explicit_arguments' | 'conversation_context' | 'not_reported';
};

/** Compare exact UTF-8 input, not a word blacklist: canonical negatives and
 * quoted article text legitimately contain words like “photorealism” or “3D”.
 * A client report is not independent observation of the native generator. */
export function imageGenerationEvidence(input: { kind: string; origin: string; briefId?: string;
  generationReport?: z.infer<typeof generationReportInput> }, brief?: { prompt?: string; referenceHash?: string; handoffVersion?: string } | null): GenerationEvidence {
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
    inputMode: report?.inputMode || 'not_reported',
    requiresPersonalSelection: relevant && (brief?.handoffVersion === IMAGE_HANDOFF_VERSION || status !== 'client_reported_match'), exactPromptExecutionVerified: false, reasons };
}
