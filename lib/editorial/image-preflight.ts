import { z } from 'zod';
import { submissionId } from './submission-contract';
import { readSubmission, submissionStore } from './submissions';
import { readImageGenSnapshot } from '@/lib/image-gen/snapshot';
import { IMAGE_HANDOFF_VERSION, promptHash } from './image-generation-evidence';
import { readRetainedReference, validateReference } from './image-reference';
import { NATIVE_IMAGE_INTEGRATION } from './native-image-integration';
import { imageProtectedContentHash } from './image-content-invariant';
import { readImageFailures } from './image-failure';
import { readImageAttemptResume } from './image-attempt-resume';
import { declinedPlacementImages, isPendingImageCandidate } from './image-candidate-state';

export const imagePreflightInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  role: z.enum(['cover', 'body']), sectionId: submissionId, briefId: submissionId.optional(),
  subjectReferencesRequired: z.boolean(), subjectReferenceIds: z.array(submissionId).max(4),
}).strict();

/** Read-only: no new brief, reference upload, attempt, generation, consent or CMS
 * write. A readiness snapshot is not an execution permit. */
export async function preflightSubmissionImage(uid: string, raw: unknown, importRequestId?: string) {
  const input = imagePreflightInput.parse(raw), row = await readSubmission(uid, input.submissionId);
  const ref = submissionStore().collection.doc(row.id), blockers: string[] = [];
  const add = (code: string) => { if (!blockers.includes(code)) blockers.push(code); };
  if (row.revision !== input.expectedRevision) add('mcp_submission_revision_conflict');
  if (['film', 'tv-series'].includes(row.article.subjectType || '')) add('mcp_submission_film_requires_real_stills');
  const snapshot = await readImageGenSnapshot(uid, `submission-${row.id}`);
  if (!snapshot.article.sections.some(s => s.id === input.sectionId)) add('mcp_submission_anchor_changed');
  const saved = input.briefId ? (await ref.collection('chatBriefs').doc(input.briefId).get()).data() : null;
  // Never read private reference bytes from a foreign/corrupt record.
  const brief = saved?.uid === uid && saved?.submissionId === row.id ? saved : null;
  if (saved && !brief) add('mcp_submission_generation_brief_invalid');
  if (!brief) add('mcp_submission_brief_required');
  else if (brief.uid !== uid || brief.submissionId !== row.id || brief.expectedRevision !== row.revision ||
      brief.contentHash !== row.contentHash || brief.role !== input.role || brief.sectionId !== input.sectionId ||
      brief.handoffVersion !== IMAGE_HANDOFF_VERSION || typeof brief.prompt !== 'string' || !brief.prompt ||
      promptHash(brief.prompt) !== brief.canonicalPromptHash) add('mcp_submission_generation_brief_invalid');
  if (brief && !brief.protectedContentHash) add('mcp_submission_generation_brief_invalid');
  else if (brief && brief.protectedContentHash !== imageProtectedContentHash(row.article)) add('mcp_submission_image_content_changed');

  const actualReferences: Array<{ purpose: string; sha256: string; byteCount: number; width: number; height: number }> = [];
  const refs = Array.isArray(brief?.retainedReferences) ? brief.retainedReferences : [];
  if (!refs.length || refs[0]?.purpose !== 'style' || refs[0]?.sha256 !== brief?.referenceHash) add('mcp_submission_style_reference_required');
  if (JSON.stringify(refs.map((r: any) => r.sha256)) !== JSON.stringify(brief?.requiredReferenceHashes)) add('mcp_submission_generation_references_mismatch');
  if (refs.length > 6) add('mcp_submission_reference_bundle_too_large');
  else for (const reference of refs) {
    try {
      const image = await readRetainedReference(reference), meta = await validateReference(Buffer.from(image.data, 'base64'));
      actualReferences.push({ purpose: reference.purpose, ...meta });
    } catch { add(reference.purpose === 'style' ? 'mcp_submission_style_reference_required' : 'mcp_submission_reference_missing'); }
  }
  if (actualReferences.reduce((sum, r) => sum + r.byteCount, 0) > 3 * 1024 * 1024) add('mcp_submission_reference_bundle_too_large');
  const requiredSubjects = input.subjectReferencesRequired || brief?.subjectReferencesRequired === true;
  if (requiredSubjects && (!input.subjectReferenceIds.length || !refs.some((r: any) => r.purpose === 'subject'))) add('mcp_submission_subject_reference_required');
  if (brief && JSON.stringify(input.subjectReferenceIds) !== JSON.stringify(brief.subjectReferenceIds || [])) add('mcp_submission_generation_references_mismatch');
  for (const [index, referenceId] of input.subjectReferenceIds.entries()) {
    const subject = (await ref.collection('imageReferences').doc(referenceId).get()).data();
    if (!subject || subject.uid !== uid || subject.submissionId !== row.id || subject.purpose !== 'user-uploaded-subject-photo' ||
        subject.reference?.sha256 !== refs.filter((r: any) => r.purpose === 'subject')[index]?.sha256) add('mcp_submission_subject_reference_required');
  }
  const failures = await readImageFailures(uid, row.id);
  const candidates = await ref.collection('chatAssets').limit(101).get();
  if (candidates.size > 100) add('mcp_submission_media_window_exceeded');
  const declines = declinedPlacementImages(candidates.docs.map(d => d.data()), uid, row.id, input.role, input.sectionId);
  const resume = await readImageAttemptResume(uid, row, input, brief, failures);
  if (declines.length || failures.some(f => f.role === input.role && f.sectionId === input.sectionId)) {
    if (!resume || (importRequestId && (resume.requestId !== importRequestId || resume.status !== 'dispatch_claimed')))
      add('mcp_submission_image_attempt_stopped');
    else if (!importRequestId && !resume.canDispatch) add('mcp_submission_image_dispatch_already_claimed');
  }
  if (candidates.docs.some(doc => isPendingImageCandidate(doc.data()))) add('mcp_submission_image_selection_required');
  // Second read closes an observable race; dispatch must still revalidate in the
  // future host adapter. No preflight result can be reused as a bearer permit.
  const current = await readSubmission(uid, row.id);
  if (current.revision !== row.revision || current.contentHash !== row.contentHash ||
      imageProtectedContentHash(current.article) !== imageProtectedContentHash(row.article)) add('mcp_submission_image_content_changed');
  const inputsComplete = blockers.length === 0;
  return { submissionId: row.id, revision: row.revision, contentHash: row.contentHash,
    protectedContentHash: imageProtectedContentHash(row.article), role: input.role, sectionId: input.sectionId, briefId: input.briefId ?? null,
    checkedAt: new Date().toISOString(), inputsComplete, canGenerate: inputsComplete, canImportGeneratedImage: false,
    canStageForPersonalSelection: inputsComplete, hostDeliveryRequired: true,
    blockers, references: actualReferences, integration: NATIVE_IMAGE_INTEGRATION, failures, declinedImages: declines, authorizedResume: resume,
    visualChecks: { status: 'not_performed', independentSemanticVerification: false, personalReviewRequired: true },
    automaticRetryAllowed: false, regenerateImage: false, paidAiCalls: 0, publicationApproval: false,
    instruction: inputsComplete
      ? 'Ét kontrolleret billedforsøg er muligt, hvis den aktuelle host faktisk modtager hele den kanoniske prompt og alle originale referencebilleder uændret. Skjult generatorbehandling er ikke verificeret. Kan hosten ikke modtage inputtene, STOP. Kontrollér resultatet; import_submission_image gemmer kun en privat kandidat indtil brugerens personlige valg. Ingen automatisk retry eller publicering.'
      : 'STOP før billedkald. Løs de konkrete blockers, bevar originaler og request-ID. Hent preview ved afventende personligt billedvalg. Et nyt brief eller en klienthash ophæver ikke stoppet.' };
}
