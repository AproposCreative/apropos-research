import { createHash } from 'node:crypto';
import { z } from 'zod';
import { readSubmission, submissionStore } from './submissions';
import { submissionId } from './submission-contract';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { readImageGenStyleConfig, imageGenStyleReference } from '@/lib/image-gen/style-config';
import { buildAproposImagePrompt } from '@/lib/image-gen/prompt';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { IMAGE_HANDOFF_VERSION, IMAGE_HANDOFF_INSTRUCTION, promptHash } from './image-generation-evidence';
import { retainReference, readRetainedReference, type RetainedReference } from './image-reference';
import { NATIVE_IMAGE_INTEGRATION } from './native-image-integration';
import { imageProtectedContentHash } from './image-content-invariant';

export const chatImageBriefInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  sectionId: submissionId, excerpt: z.string().min(10).max(3500), description: z.string().min(10).max(2500),
  role: z.enum(['cover', 'body']), style: z.enum(['expressive', 'minimal']).default('expressive'),
  parentAssetId: submissionId.optional(), editInstruction: z.string().min(3).max(1000).optional(),
  subjectReferenceIds: z.array(submissionId).max(4).default([]),
  subjectReferencesRequired: z.boolean().default(false).describe('Set true when the user requested uploaded subject photos. Missing actual files blocks generation.'),
}).strict();

/** Supplies our instructions, not a new AI-generated idea or a research approval. */
export async function getChatImageBrief(uid: string, raw: unknown) {
  const input = chatImageBriefInput.parse(raw), row = await readSubmission(uid, input.submissionId);
  if (row.revision !== input.expectedRevision) throw Error('mcp_submission_revision_conflict');
  if (['film', 'tv-series'].includes(row.article.subjectType || '')) throw Error('mcp_submission_film_requires_real_stills');
  const { article } = await readImageGenSnapshot(uid, row.id ? `submission-${row.id}` : '');
  const section = article.sections.find(s => s.id === input.sectionId && s.text.includes(input.excerpt));
  if (!section) throw Error('mcp_submission_anchor_changed');
  if (input.editInstruction && !input.parentAssetId) throw Error('mcp_submission_parent_required');
  if (input.parentAssetId && !input.editInstruction) throw Error('mcp_submission_edit_instruction_required');
  const parent = input.parentAssetId ? (await submissionStore().collection.doc(row.id).collection('chatAssets').doc(input.parentAssetId).get()).data() : null;
  if (input.parentAssetId && (!parent || parent.uid !== uid || !parent.url)) throw Error('mcp_submission_parent_required');
  if (input.subjectReferencesRequired && !input.subjectReferenceIds.length) throw Error('mcp_submission_subject_reference_required');
  if (new Set(input.subjectReferenceIds).size !== input.subjectReferenceIds.length) throw Error('mcp_submission_reference_duplicate');
  const config = await readImageGenStyleConfig();
  const reference = await imageGenStyleReference(config, input.style).catch(() => { throw Error('mcp_submission_style_reference_required'); });
  const referenceBytes = Buffer.from(await reference.arrayBuffer());
  const styleReference = await retainReference(uid, referenceBytes).catch(() => { throw Error('mcp_submission_style_reference_required'); });
  const referenceHash = createHash('sha256').update(referenceBytes).digest('hex');
  const references: Array<RetainedReference & { purpose: string }> = [{ ...styleReference, purpose: 'style' }];
  if (parent) {
    const original: RetainedReference = { storagePath: parent.storagePath, sha256: parent.originalHash,
      mimeType: parent.mimeType, byteCount: parent.byteCount, width: parent.width, height: parent.height };
    await readRetainedReference(original);
    references.push({ ...original, purpose: 'edit-parent' });
  }
  for (const referenceId of input.subjectReferenceIds) {
    const saved = (await submissionStore().collection.doc(row.id).collection('imageReferences').doc(referenceId).get()).data();
    if (!saved || saved.uid !== uid || saved.submissionId !== row.id || saved.purpose !== 'user-uploaded-subject-photo') throw Error('mcp_submission_subject_reference_required');
    references.push({ ...saved.reference, purpose: 'subject' });
  }
  // Base64 adds one third. Keep the complete MCP response below the hosting
  // response limit without silently resizing the user's reference originals.
  if (references.reduce((size, ref) => size + ref.byteCount, 0) > 3_000_000) throw Error('mcp_submission_reference_bundle_too_large');
  const additionalReferences = await Promise.all(references.slice(1).map(readRetainedReference));
  const requiredReferenceHashes = references.map(ref => ref.sha256);
  const prompt = buildAproposImagePrompt({ config, style: input.style, title: row.article.title,
    passage: section.text, description: input.description,
    editInstruction: [input.editInstruction ? `The second reference is the image to edit. Preserve it except for this requested change: ${input.editInstruction}` : '',
      input.subjectReferenceIds.length ? `References ${parent ? '3' : '2'} onwards are the user-uploaded subject photos. Use their subjects, not their photographic style; do not substitute invented likenesses.` : '',
    ].filter(Boolean).join('\n') });
  const brief = { ...input, uid, contentHash: row.contentHash, protectedContentHash: imageProtectedContentHash(row.article), styleVersion: config.version, referenceHash, prompt,
    canonicalPromptHash: promptHash(prompt), handoffVersion: IMAGE_HANDOFF_VERSION, requiredReferenceHashes,
    generationContract: { instruction: IMAGE_HANDOFF_INSTRUCTION, promptField: 'prompt', referenceHash,
      reportField: 'generationReport', exactPromptExecutionVerified: false,
      canGenerate: false, preflightTool: 'preflight_submission_image', integration: NATIVE_IMAGE_INTEGRATION,
      evidenceLimit: 'Hashes verify the client report, not the hidden native image-generation input. This brief is NOT permission to call the generator.' },
    references: references.map(({ storagePath: _path, ...ref }) => ref),
    parentUrl: parent?.url || null, output: { kind: 'standalone-illustration', count: 1, format: 'landscape', minimumWidth: 1200, minimumHeight: 800, text: 'none' },
    visualEvidence: { status: 'not_server_verified', suppliedSources: row.research },
    instruction: 'STOP før billedgenerering: kald preflight_submission_image med dette brief og de samme motivreferencer. canGenerate=false er et integrationsstop, ikke tilladelse til et prøvebillede. Ingen omskrivning, fallback eller automatisk retry. Bevar originale filer. Film/TV bruger rigtige stills. Ingen personlig godkendelse eller publicering.' };
  const current = await readSubmission(uid, row.id);
  if (current.revision !== row.revision || current.contentHash !== row.contentHash || imageProtectedContentHash(current.article) !== brief.protectedContentHash)
    throw Error('mcp_submission_image_content_changed');
  const briefId = cmsFieldHash(brief), ref = submissionStore().collection.doc(row.id).collection('chatBriefs').doc(briefId);
  if (!(await ref.get()).exists) { try { await ref.create({ ...brief, retainedReferences: references, briefId, createdAt: new Date().toISOString() }); } catch (error) {
    if (!(await ref.get()).exists) throw error;
  } }
  return { brief: { ...brief, briefId, paidAiCalls: 0 }, reference: { data: referenceBytes.toString('base64'), mimeType: styleReference.mimeType }, additionalReferences };
}
