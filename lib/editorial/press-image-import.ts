import { z } from 'zod';
import sharp from 'sharp';
import { submissionId, submissionInput } from './submission-contract';
import { readSubmission, submissionStore } from './submissions';
import { importSuppliedImage } from './chat-image-import';
import { downloadVerifiedPressImage, PRESS_POLICY } from '@/lib/image-gen/press-candidates';
import type { ImageGenPressCandidate } from '@/lib/image-gen/press';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';

export const pressImagePreviewInput = z.object({ submissionId, searchId: submissionId, candidateId: submissionId }).strict();
export const pressImageImportInput = pressImagePreviewInput.extend({ expectedRevision: z.number().int().positive(), requestId: submissionInput.shape.requestId,
  role: z.enum(['cover', 'body']), sectionId: submissionId.optional(), alt: z.string().min(3).max(500), caption: z.string().max(500),
  visualCheck: z.object({ relevant: z.literal(true), coverTextFree: z.boolean() }).strict(),
}).strict();

async function candidateFor(uid: string, input: z.infer<typeof pressImagePreviewInput>) {
  await readSubmission(uid, input.submissionId);
  const search = (await submissionStore().collection.doc(input.submissionId).collection('pressSearches').doc(input.searchId).get()).data();
  const candidate = (search?.candidates as ImageGenPressCandidate[] | undefined)?.find(c => c.id === input.candidateId);
  if (search?.policyVersion !== PRESS_POLICY || candidate?.validation !== 'decoded') throw Error('mcp_submission_press_candidate_unverified');
  return candidate;
}

export async function previewSubmissionPressImage(uid: string, raw: unknown) {
  const input = pressImagePreviewInput.parse(raw), candidate = await candidateFor(uid, input);
  const { response } = await downloadVerifiedPressImage(candidate);
  const bytes = await sharp(response.bytes).rotate().resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  return { candidate, paidAiCalls: 0, imported: false, image: { data: bytes.toString('base64'), mimeType: 'image/webp' },
    instruction: 'Visuel kontrol, ikke personlig godkendelse. Thumbnail er kun visning; import bevarer originalfilen. Kontroller især tekst/logoer i cover.' };
}

export async function importSubmissionPressImage(uid: string, raw: unknown) {
  const input = pressImageImportInput.parse(raw), candidate = await candidateFor(uid, input);
  if (input.role === 'cover' && !input.visualCheck.coverTextFree) throw Error('mcp_submission_cover_visible_text');
  if (input.role === 'body' && !input.sectionId) throw Error('mcp_submission_anchor_changed');
  // No new upload just because another chat invents a different request ID.
  // Claim by original bytes, preserving the first operation and its receipts.
  const { db, collection } = submissionStore(), root = collection.doc(input.submissionId);
  const claim = root.collection('pressImports').doc(candidate.sha256);
  const { expectedRevision: _expectedRevision, ...intent } = input;
  const requestHash = cmsFieldHash(intent);
  if (input.role === 'body' && !(await claim.get()).exists) {
    const snapshot = await readImageGenSnapshot(uid, `submission-${input.submissionId}`);
    if (!snapshot.article.sections.some(s => s.id === input.sectionId)) throw Error('mcp_submission_anchor_changed');
  }
  await db.runTransaction(async tx => {
    const old = (await tx.get(claim)).data();
    const row = (await tx.get(root)).data();
    if (old) { if (old.requestHash !== requestHash) throw Error('mcp_submission_press_import_exists_read_status'); return; }
    if (row?.uid !== uid || row.revision !== input.expectedRevision) throw Error('mcp_submission_revision_conflict');
    tx.create(claim, { requestHash, requestId: input.requestId, candidateId: candidate.id, searchId: input.searchId,
      assetId: cmsFieldHash({ uid, id: input.submissionId, requestId: input.requestId }), createdAt: new Date().toISOString() });
  });
  return importSuppliedImage(uid, { submissionId: input.submissionId, expectedRevision: input.expectedRevision, requestId: input.requestId,
    role: input.role, ...(input.sectionId ? { sectionId: input.sectionId } : {}), kind: 'photo', origin: 'press-source', alt: input.alt, caption: input.caption,
    credit: candidate.credit ? `Foto: ${candidate.credit}` : `Kilde: ${new URL(candidate.sourceUrl).hostname} (fotograf ikke oplyst)`,
    sourceUrl: candidate.sourceUrl, originalUrl: candidate.originalUrl }, {
    identity: `press:${candidate.sha256}`, mimeType: candidate.mimeType, provenance: 'verified-public-press-bytes',
    evidence: { ...candidate, searchId: input.searchId, visualCheck: input.visualCheck, visualCheckSource: 'agent_reported_not_personal_approval' },
    read: async () => (await downloadVerifiedPressImage(candidate)).response.bytes,
  });
}
