import { createHash } from 'node:crypto';
import { z } from 'zod';
import { readSubmission, submissionStore } from './submissions';
import { submissionId } from './submission-contract';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { readImageGenStyleConfig, imageGenStyleReference } from '@/lib/image-gen/style-config';
import { buildAproposImagePrompt } from '@/lib/image-gen/prompt';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { IMAGE_HANDOFF_VERSION, IMAGE_HANDOFF_INSTRUCTION, promptHash } from './image-generation-evidence';

export const chatImageBriefInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  sectionId: submissionId, excerpt: z.string().min(10).max(3500), description: z.string().min(10).max(2500),
  role: z.enum(['cover', 'body']), style: z.enum(['expressive', 'minimal']).default('expressive'),
  parentAssetId: submissionId.optional(), editInstruction: z.string().min(3).max(1000).optional(),
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
  const parent = input.parentAssetId ? (await submissionStore().collection.doc(row.id).collection('chatAssets').doc(input.parentAssetId).get()).data() : null;
  if (input.parentAssetId && (!parent || parent.uid !== uid || !parent.url)) throw Error('mcp_submission_parent_required');
  const config = await readImageGenStyleConfig(), reference = await imageGenStyleReference(config, input.style);
  const referenceBytes = Buffer.from(await reference.arrayBuffer());
  const referenceHash = createHash('sha256').update(referenceBytes).digest('hex');
  const prompt = buildAproposImagePrompt({ config, style: input.style, title: row.article.title,
    passage: section.text, description: input.description,
    editInstruction: input.editInstruction ? `The second reference is the image to edit. Preserve it except for this requested change: ${input.editInstruction}` : '' });
  const brief = { ...input, uid, contentHash: row.contentHash, styleVersion: config.version, referenceHash, prompt,
    canonicalPromptHash: promptHash(prompt), handoffVersion: IMAGE_HANDOFF_VERSION,
    generationContract: { instruction: IMAGE_HANDOFF_INSTRUCTION, promptField: 'prompt', referenceHash,
      reportField: 'generationReport', exactPromptExecutionVerified: false,
      evidenceLimit: 'Hashes verify the client report, not the hidden native image-generation input.' },
    parentUrl: parent?.url || null, output: { format: 'landscape', minimumWidth: 1200, minimumHeight: 800, text: 'none' },
    visualEvidence: { status: 'not_server_verified', suppliedSources: row.research },
    instruction: 'Brug denne prompt og den vedlagte stilreference i Chattens billedværktøj. Hent dokumenterede personreferencer før portrætlighed. Vis billedværktøjets billedoutput direkte i chatten, ikke kun et file-ID eller en filsti. Importér den valgte eksisterende fil med import_submission_image og vis derefter preview_submission. Ved filoverleveringsfejl: bevar billedet og brug samme fil, aldrig en ny generation eller en opdigtet downloadadresse. Ingen API-generation. Film/TV bruger rigtige stills. Illustrationen er ikke et dokumentarisk foto.' };
  const briefId = cmsFieldHash(brief), ref = submissionStore().collection.doc(row.id).collection('chatBriefs').doc(briefId);
  if (!(await ref.get()).exists) { try { await ref.create({ ...brief, briefId, createdAt: new Date().toISOString() }); } catch (error) {
    if (!(await ref.get()).exists) throw error;
  } }
  return { brief: { ...brief, briefId, paidAiCalls: 0 }, reference: { data: referenceBytes.toString('base64'), mimeType: reference.type } };
}
