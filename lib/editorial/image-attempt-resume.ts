import { z } from 'zod';
import { getAdminAuth } from '@/lib/firebase-admin';
import { OWNER_EMAIL } from '@/lib/editorial-capabilities';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore } from './submissions';
import { submissionId, submissionInput, type SubmissionRecord } from './submission-contract';
import { imageProtectedContentHash } from './image-content-invariant';
import { readImageFailures } from './image-failure';

type Placement = { role: string; sectionId?: string; briefId?: string; expectedRevision: number };
type Failures = Awaited<ReturnType<typeof readImageFailures>>;
function failureIds(failures: Failures, input: Placement) {
  return failures.filter(f => f.role === input.role && f.sectionId === input.sectionId).map(f => f.failureId).sort();
}
function binding(uid: string, row: SubmissionRecord, input: Placement, brief: any, failures: Failures) {
  return { uid, submissionId: row.id, expectedRevision: input.expectedRevision, contentHash: row.contentHash,
    protectedContentHash: imageProtectedContentHash(row.article), role: input.role, sectionId: input.sectionId ?? null,
    briefId: input.briefId ?? null, canonicalPromptHash: brief?.canonicalPromptHash ?? null,
    referenceHashes: brief?.requiredReferenceHashes ?? [], failureIds: failureIds(failures, input) };
}
function grantId(uid: string, id: string, ids: string[]) { return cmsFieldHash({ uid, submissionId: id, failureIds: ids }); }

/** Read-only. A different request, brief, article or newly rejected output cannot
 * reuse the grant. Dispatch is consumed before the external native call; import
 * recovery keeps the original request, never authorizes another generation. */
export async function readImageAttemptResume(uid: string, row: SubmissionRecord, input: Placement, brief: any, failures: Failures) {
  const expected = binding(uid, row, input, brief, failures);
  if (!expected.failureIds.length) return null;
  const saved = (await submissionStore().collection.doc(row.id).collection('imageAttemptResumes')
    .doc(grantId(uid, row.id, expected.failureIds)).get()).data();
  if (!saved || saved.bindingHash !== cmsFieldHash(expected) || saved.uid !== uid ||
      row.revision !== input.expectedRevision || !['authorized', 'dispatch_claimed'].includes(saved.status)) return null;
  if (saved.status === 'authorized' && Date.parse(saved.expiresAt) <= Date.now()) return null;
  return { grantId: saved.grantId as string, requestId: saved.requestId as string,
    status: saved.status as 'authorized' | 'dispatch_claimed', inputMode: 'explicit_arguments' as const,
    canDispatch: saved.status === 'authorized', publicationApproval: false, automaticRetryAllowed: false };
}

export const imageAttemptResumeInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  role: z.enum(['cover', 'body']), sectionId: submissionId, briefId: submissionId,
  requestId: submissionInput.shape.requestId, decision: z.string().min(12).max(2000),
  resolution: z.string().min(12).max(2000), inputMode: z.literal('explicit_arguments'),
}).strict();

/** Service-operator operation only, deliberately NOT exposed as a model tool.
 * The operator must have a direct human decision. The immutable decision record
 * is retry authority, NOT personal image selection or editorial approval. */
export async function authorizeImageAttemptResume(uid: string, raw: unknown) {
  const input = imageAttemptResumeInput.parse(raw);
  const account = await getAdminAuth()!.getUser(uid);
  if (!account.emailVerified || account.disabled || account.email?.toLowerCase() !== OWNER_EMAIL)
    throw Error('mcp_submission_owner_required');
  const row = await readSubmission(uid, input.submissionId), { db, collection } = submissionStore();
  if (row.status !== 'draft') throw Error('mcp_submission_operation_pending');
  const ref = collection.doc(row.id), brief = (await ref.collection('chatBriefs').doc(input.briefId).get()).data();
  const failures = await readImageFailures(uid, row.id);
  const ids = failureIds(failures, input);
  if (!ids.length || failures.some(f => ids.includes(f.failureId) && !f.originalPreserved))
    throw Error('mcp_submission_retry_evidence_missing');
  if (ids.includes(cmsFieldHash({ uid, submissionId: row.id, requestId: input.requestId })))
    throw Error('mcp_submission_idempotency_conflict');
  const { preflightSubmissionImage } = await import('./image-preflight');
  const check = await preflightSubmissionImage(uid, { submissionId: row.id, expectedRevision: input.expectedRevision,
    role: input.role, sectionId: input.sectionId, briefId: input.briefId,
    subjectReferencesRequired: brief?.subjectReferencesRequired === true, subjectReferenceIds: brief?.subjectReferenceIds || [] });
  const other = check.blockers.filter(code => !['mcp_submission_image_attempt_stopped', 'mcp_submission_image_dispatch_already_claimed'].includes(code));
  if (other.length) throw Error(other[0]);
  const expected = binding(uid, row, input, brief, failures), id = grantId(uid, row.id, ids);
  const target = ref.collection('imageAttemptResumes').doc(id), intentHash = cmsFieldHash({ ...input, binding: expected });
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data(), old = (await tx.get(target)).data();
    const currentBrief = (await tx.get(ref.collection('chatBriefs').doc(input.briefId))).data();
    const currentFailures = await tx.get(ref.collection('imageFailures').limit(101));
    if (cmsFieldHash(current) !== cmsFieldHash(row) || cmsFieldHash(currentBrief) !== cmsFieldHash(brief) ||
        JSON.stringify(currentFailures.docs.filter(d => d.data().role === input.role && d.data().sectionId === input.sectionId).map(d => d.id).sort()) !== JSON.stringify(ids))
      throw Error('mcp_submission_image_content_changed');
    if (old && old.intentHash !== intentHash) throw Error('mcp_submission_idempotency_conflict');
    if (!old) tx.create(target, { ...expected, grantId: id, bindingHash: cmsFieldHash(expected), intentHash,
      requestId: input.requestId, decision: input.decision, resolution: input.resolution, inputMode: input.inputMode,
      status: 'authorized', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      authorizationSource: 'operator_recorded_direct_owner_decision', publicationApproval: false, automaticRetryAllowed: false });
  });
  return readImageAttemptResume(uid, row, input, brief, failures);
}

/** Invoke immediately before the ONE external dispatch. A lost reply must be
 * read back, never re-dispatched. Concurrent/repeated claims return false. */
export async function claimImageAttemptResume(uid: string, raw: unknown) {
  const input = imageAttemptResumeInput.parse(raw);
  const row = await readSubmission(uid, input.submissionId), { db, collection } = submissionStore(), ref = collection.doc(row.id);
  const brief = (await ref.collection('chatBriefs').doc(input.briefId).get()).data(), failures = await readImageFailures(uid, row.id);
  const grant = await readImageAttemptResume(uid, row, input, brief, failures);
  if (!grant || grant.requestId !== input.requestId) throw Error('mcp_submission_image_attempt_stopped');
  if (!grant.canDispatch) return { ...grant, dispatchAllowed: false };
  const { preflightSubmissionImage } = await import('./image-preflight');
  const check = await preflightSubmissionImage(uid, { submissionId: row.id, expectedRevision: input.expectedRevision,
    role: input.role, sectionId: input.sectionId, briefId: input.briefId,
    subjectReferencesRequired: brief?.subjectReferencesRequired === true, subjectReferenceIds: brief?.subjectReferenceIds || [] });
  if (!check.canGenerate) {
    if (check.blockers.length === 1 && check.blockers[0] === 'mcp_submission_image_dispatch_already_claimed')
      return { ...grant, canDispatch: false, status: 'dispatch_claimed', dispatchAllowed: false };
    throw Error(check.blockers[0]);
  }
  const dispatchAllowed = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data(), target = ref.collection('imageAttemptResumes').doc(grant.grantId);
    const saved = (await tx.get(target)).data();
    const currentBrief = (await tx.get(ref.collection('chatBriefs').doc(input.briefId))).data();
    const currentFailures = await tx.get(ref.collection('imageFailures').limit(101));
    const assets = await tx.get(ref.collection('chatAssets').limit(101));
    if (cmsFieldHash(current) !== cmsFieldHash(row) || cmsFieldHash(currentBrief) !== cmsFieldHash(brief) ||
        JSON.stringify(currentFailures.docs.filter(d => d.data().role === input.role && d.data().sectionId === input.sectionId).map(d => d.id).sort()) !== JSON.stringify(failureIds(failures, input)) ||
        assets.size > 100 || assets.docs.some(d => d.data().importInput && d.data().status !== 'attached')) throw Error('mcp_submission_image_content_changed');
    if (saved?.status !== 'authorized' || Date.parse(saved.expiresAt) <= Date.now()) return false;
    tx.update(target, { status: 'dispatch_claimed', dispatchClaimedAt: new Date().toISOString() }); return true;
  });
  return { ...grant, canDispatch: false, status: 'dispatch_claimed', dispatchAllowed };
}
