import { z } from 'zod';
import { getAdminAuth } from '@/lib/firebase-admin';
import { OWNER_EMAIL } from '@/lib/editorial-capabilities';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readSubmission, submissionStore } from './submissions';
import { submissionId, submissionInput, type SubmissionRecord } from './submission-contract';
import { imageProtectedContentHash } from './image-content-invariant';
import { readImageFailures } from './image-failure';
import { declinedPlacementImages } from './image-candidate-state';
import { nativeImageInputMode } from './image-generation-evidence';

type Placement = { role: string; sectionId?: string; briefId?: string; expectedRevision: number };
type Failures = Awaited<ReturnType<typeof readImageFailures>>;
function failureIds(failures: Failures, input: Placement) {
  return failures.filter(f => f.role === input.role && f.sectionId === input.sectionId).map(f => f.failureId).sort();
}
type Declines = ReturnType<typeof declinedPlacementImages>;
function binding(uid: string, row: SubmissionRecord, input: Placement, brief: any, failures: Failures, declines: Declines = []) {
  return { uid, submissionId: row.id, expectedRevision: input.expectedRevision, contentHash: row.contentHash,
    protectedContentHash: imageProtectedContentHash(row.article), role: input.role, sectionId: input.sectionId ?? null,
    briefId: input.briefId ?? null, canonicalPromptHash: brief?.canonicalPromptHash ?? null,
    referenceHashes: brief?.requiredReferenceHashes ?? [], failureIds: failureIds(failures, input),
    ...(declines.length ? { declinedImages: declines } : {}) };
}
function grantId(uid: string, id: string, ids: string[], declines: Declines = []) {
  // Keep legacy IDs valid. A later personal decline creates a NEW immutable
  // decision scope, not an overwrite or refresh of the consumed historical grant.
  return cmsFieldHash({ uid, submissionId: id, failureIds: ids, ...(declines.length ? { declinedImages: declines } : {}) });
}

/** Read-only. A different request, brief, article or newly rejected output cannot
 * reuse the grant. Dispatch is consumed before the external native call; import
 * recovery keeps the original request, never authorizes another generation. */
export async function readImageAttemptResume(uid: string, row: SubmissionRecord, input: Placement, brief: any, failures: Failures) {
  const assets = await submissionStore().collection.doc(row.id).collection('chatAssets').limit(101).get();
  if (assets.size > 100) throw Error('mcp_submission_media_window_exceeded');
  const declines = declinedPlacementImages(assets.docs.map(d => d.data()), uid, row.id, input.role, input.sectionId);
  const expected = binding(uid, row, input, brief, failures, declines);
  if (!expected.failureIds.length && !declines.length) return null;
  const ref = submissionStore().collection.doc(row.id), rootId = grantId(uid, row.id, expected.failureIds, declines);
  const head = (await ref.collection('imageAttemptResumeHeads').doc(rootId).get()).data();
  if (head && (head.uid !== uid || head.bindingHash !== cmsFieldHash(expected) || !submissionId.safeParse(head.grantId).success)) return null;
  const saved = (await ref.collection('imageAttemptResumes').doc(head?.grantId ?? rootId).get()).data();
  if (!saved || !nativeImageInputMode.safeParse(saved.inputMode).success || saved.bindingHash !== cmsFieldHash(expected) || saved.uid !== uid ||
      row.revision !== input.expectedRevision || !['authorized', 'dispatch_claimed'].includes(saved.status)) return null;
  if (saved.status === 'authorized' && !(Date.parse(saved.expiresAt) > Date.now())) return null;
  return { grantId: saved.grantId as string, requestId: saved.requestId as string,
    status: saved.status as 'authorized' | 'dispatch_claimed', inputMode: nativeImageInputMode.parse(saved.inputMode),
    canDispatch: saved.status === 'authorized', expiresAt: saved.expiresAt as string,
    publicationApproval: false, automaticRetryAllowed: false };
}

export const imageAttemptResumeInput = z.object({ submissionId, expectedRevision: z.number().int().positive(),
  role: z.enum(['cover', 'body']), sectionId: submissionId, briefId: submissionId,
  requestId: submissionInput.shape.requestId, decision: z.string().min(12).max(2000),
  resolution: z.string().min(12).max(2000), inputMode: nativeImageInputMode,
}).strict();

// Model callers can consume an EXISTING owner decision, never create or amend it.
export const imageAttemptClaimInput = imageAttemptResumeInput.omit({ decision: true, resolution: true })
  .extend({ grantId: submissionId }).strict();

export async function claimSubmissionImageAttempt(uid: string, raw: unknown) {
  const input = imageAttemptClaimInput.parse(raw);
  const row = await readSubmission(uid, input.submissionId);
  const saved = (await submissionStore().collection.doc(row.id).collection('imageAttemptResumes').doc(input.grantId).get()).data();
  if (!saved || saved.uid !== uid || saved.grantId !== input.grantId || saved.requestId !== input.requestId ||
      saved.inputMode !== input.inputMode || saved.authorizationSource !== 'operator_recorded_direct_owner_decision')
    throw Error('mcp_submission_image_attempt_stopped');
  const { grantId: expectedGrantId, ...placement } = input;
  const claim = await claimImageAttemptResume(uid, { ...placement, decision: saved.decision, resolution: saved.resolution }, expectedGrantId);
  return { ...claim, submissionId: row.id, expectedRevision: input.expectedRevision, role: input.role,
    sectionId: input.sectionId, briefId: input.briefId, generationStarted: false, paidAiCalls: 0,
    exactPromptExecutionVerified: false,
    instruction: claim.dispatchAllowed
      ? `Kun dette første succesfulde claim åbner ét native billedkald NU med hele den kanoniske prompt og alle faktiske referencefiler, uændret via ${claim.inputMode}. Ved conversation_context skal det præcise brief og de faktiske ordnede referencebilleder være i den aktuelle generators samtalekontekst, ikke kun hashes, links eller en opsummering. Kan hosten ikke modtage dette, STOP. Rapportér den faktiske inputMode ved import af samme original med samme requestId. Claim starter ikke generering og beviser ikke skjulte generatorinput. Efter claim vil preflight vise dispatch_already_claimed; det forbyder et ekstra kald, ikke import af det allerede bestilte resultat. Kontrollér resultatet, gem kun privat kandidat, og vis personligt billedvalg. Ingen automatisk retry eller publicering.`
      : 'STOP: tilladelsen er allerede taget i brug. Ingen ny generering, heller ikke efter tabt svar. Læs status/kvitteringer og genoptag kun import af et allerede eksisterende resultat med samme requestId.' };
}

/** Service-operator operation only, deliberately NOT exposed as a model tool.
 * The operator must have a direct human decision. The immutable decision record
 * is retry authority, NOT personal image selection or editorial approval. */
export async function authorizeImageAttemptResume(uid: string, raw: unknown) {
  return authorizeAttempt(uid, imageAttemptResumeInput.parse(raw));
}

// Separate operator-only action, NEVER a model tool. Requires a new direct owner
// decision and an exact expired, UNUSED predecessor. History is never extended,
// reset or overwritten; a routing head selects the one new immutable decision.
const imageAttemptRenewalInput = imageAttemptResumeInput.extend({ previousGrantId: submissionId }).strict();
export async function renewExpiredImageAttemptResume(uid: string, raw: unknown) {
  const { previousGrantId, ...input } = imageAttemptRenewalInput.parse(raw);
  return authorizeAttempt(uid, input, previousGrantId);
}

/** Operator-only correction of delivery mode for the SAME unused attempt. Keeps
 * request ID and original expiry; immutable predecessor is never rewritten.
 * Requires a direct owner decision, not a model-reported capability flag. */
export async function adaptUnusedImageAttemptInputMode(uid: string, raw: unknown) {
  const { previousGrantId, ...input } = imageAttemptRenewalInput.parse(raw);
  return authorizeAttempt(uid, input, previousGrantId, true);
}

async function authorizeAttempt(uid: string, input: z.infer<typeof imageAttemptResumeInput>, previousGrantId?: string, adaptMode = false) {
  const account = await getAdminAuth()!.getUser(uid);
  if (!account.emailVerified || account.disabled || account.email?.toLowerCase() !== OWNER_EMAIL)
    throw Error('mcp_submission_owner_required');
  const row = await readSubmission(uid, input.submissionId), { db, collection } = submissionStore();
  if (row.status !== 'draft') throw Error('mcp_submission_operation_pending');
  const ref = collection.doc(row.id), brief = (await ref.collection('chatBriefs').doc(input.briefId).get()).data();
  const failures = await readImageFailures(uid, row.id);
  const ids = failureIds(failures, input);
  const assets = await ref.collection('chatAssets').limit(101).get();
  if (assets.size > 100) throw Error('mcp_submission_media_window_exceeded');
  const declines = declinedPlacementImages(assets.docs.map(d => d.data()), uid, row.id, input.role, input.sectionId);
  if ((!ids.length && !declines.length) || failures.some(f => ids.includes(f.failureId) && !f.originalPreserved))
    throw Error('mcp_submission_retry_evidence_missing');
  if (ids.includes(cmsFieldHash({ uid, submissionId: row.id, requestId: input.requestId })))
    throw Error('mcp_submission_idempotency_conflict');
  const { preflightSubmissionImage } = await import('./image-preflight');
  const check = await preflightSubmissionImage(uid, { submissionId: row.id, expectedRevision: input.expectedRevision,
    role: input.role, sectionId: input.sectionId, briefId: input.briefId,
    subjectReferencesRequired: brief?.subjectReferencesRequired === true, subjectReferenceIds: brief?.subjectReferenceIds || [] });
  const other = check.blockers.filter(code => !['mcp_submission_image_attempt_stopped', 'mcp_submission_image_dispatch_already_claimed'].includes(code));
  if (other.length) throw Error(other[0]);
  const expected = binding(uid, row, input, brief, failures, declines), rootId = grantId(uid, row.id, ids, declines);
  const transition = adaptMode ? { transition: 'input_mode_adaptation', inputMode: input.inputMode } : {};
  const id = previousGrantId ? cmsFieldHash({ rootId, previousGrantId, requestId: input.requestId, ...transition }) : rootId;
  const target = ref.collection('imageAttemptResumes').doc(id), headRef = ref.collection('imageAttemptResumeHeads').doc(rootId);
  const intentHash = cmsFieldHash({ ...input, binding: expected, ...(previousGrantId ? { previousGrantId } : {}), ...transition });
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data(), old = (await tx.get(target)).data();
    const head = (await tx.get(headRef)).data();
    const previous = previousGrantId ? (await tx.get(ref.collection('imageAttemptResumes').doc(previousGrantId))).data() : null;
    const currentBrief = (await tx.get(ref.collection('chatBriefs').doc(input.briefId))).data();
    const currentFailures = await tx.get(ref.collection('imageFailures').limit(101));
    const currentAssets = await tx.get(ref.collection('chatAssets').limit(101));
    if (cmsFieldHash(current) !== cmsFieldHash(row) || cmsFieldHash(currentBrief) !== cmsFieldHash(brief) ||
        JSON.stringify(currentFailures.docs.filter(d => d.data().role === input.role && d.data().sectionId === input.sectionId).map(d => d.id).sort()) !== JSON.stringify(ids) ||
        currentAssets.size > 100 ||
        cmsFieldHash({ declines: declinedPlacementImages(currentAssets.docs.map(d => d.data()), uid, row.id, input.role, input.sectionId) }) !== cmsFieldHash({ declines }))
      throw Error('mcp_submission_image_content_changed');
    if (old && old.intentHash !== intentHash) throw Error('mcp_submission_idempotency_conflict');
    if (head && (head.uid !== uid || head.bindingHash !== cmsFieldHash(expected))) throw Error('mcp_submission_image_attempt_stopped');
    if (previousGrantId) {
      // Exact retries recover this receipt, but never extend its expiry or follow
      // a later decision. Concurrent different renewals cannot both become active.
      if (old) {
        if (head?.grantId !== id) throw Error('mcp_submission_idempotency_conflict');
        return;
      }
      if ((head?.grantId ?? rootId) !== previousGrantId || !previous || previous.uid !== uid ||
          previous.grantId !== previousGrantId || previous.bindingHash !== cmsFieldHash(expected) ||
          previous.authorizationSource !== 'operator_recorded_direct_owner_decision' ||
          previous.status !== 'authorized' || previous.dispatchClaimedAt)
        throw Error('mcp_submission_image_attempt_renewal_requires_expired_unused');
      if (adaptMode ? !(Date.parse(previous.expiresAt) > Date.now()) || previous.requestId !== input.requestId ||
          !nativeImageInputMode.safeParse(previous.inputMode).success || previous.inputMode === input.inputMode
        : !(Date.parse(previous.expiresAt) <= Date.now()) || previous.requestId === input.requestId)
        throw Error(adaptMode ? 'mcp_submission_image_mode_adaptation_requires_active_unused' : 'mcp_submission_image_attempt_renewal_requires_expired_unused');
      if (!adaptMode && previous.inputMode !== input.inputMode)
        throw Error('mcp_submission_generation_input_mode_mismatch');
    } else if (head) throw Error('mcp_submission_idempotency_conflict');
    if (!old) tx.create(target, { ...expected, grantId: id, bindingHash: cmsFieldHash(expected), intentHash,
      ...(previousGrantId ? { previousGrantId } : {}), ...transition,
      requestId: input.requestId, decision: input.decision, resolution: input.resolution, inputMode: input.inputMode,
      status: 'authorized', createdAt: new Date().toISOString(), expiresAt: adaptMode ? previous!.expiresAt : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      authorizationSource: 'operator_recorded_direct_owner_decision', publicationApproval: false, automaticRetryAllowed: false });
    if (previousGrantId) tx.set(headRef, { uid, grantId: id, bindingHash: cmsFieldHash(expected) });
  });
  return readImageAttemptResume(uid, row, input, brief, failures);
}

/** Invoke immediately before the ONE external dispatch. A lost reply must be
 * read back, never re-dispatched. Concurrent/repeated claims return false. */
export async function claimImageAttemptResume(uid: string, raw: unknown, expectedGrantId?: string) {
  const input = imageAttemptResumeInput.parse(raw);
  const row = await readSubmission(uid, input.submissionId), { db, collection } = submissionStore(), ref = collection.doc(row.id);
  if (row.status !== 'draft') throw Error('mcp_submission_operation_pending');
  const brief = (await ref.collection('chatBriefs').doc(input.briefId).get()).data(), failures = await readImageFailures(uid, row.id);
  const grant = await readImageAttemptResume(uid, row, input, brief, failures);
  if (!grant || grant.inputMode !== input.inputMode || grant.requestId !== input.requestId || (expectedGrantId && grant.grantId !== expectedGrantId))
    throw Error('mcp_submission_image_attempt_stopped');
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
    const declines = declinedPlacementImages(assets.docs.map(d => d.data()), uid, row.id, input.role, input.sectionId);
    const head = (await tx.get(ref.collection('imageAttemptResumeHeads').doc(grantId(uid, row.id, failureIds(failures, input), declines)))).data();
    if (cmsFieldHash(current) !== cmsFieldHash(row) || cmsFieldHash(currentBrief) !== cmsFieldHash(brief) ||
        JSON.stringify(currentFailures.docs.filter(d => d.data().role === input.role && d.data().sectionId === input.sectionId).map(d => d.id).sort()) !== JSON.stringify(failureIds(failures, input)) ||
        assets.size > 100 ||
        saved?.inputMode !== input.inputMode || saved?.bindingHash !== cmsFieldHash(binding(uid, row, input, brief, failures,
          declinedPlacementImages(assets.docs.map(d => d.data()), uid, row.id, input.role, input.sectionId)))) throw Error('mcp_submission_image_content_changed');
    if (head && (head.grantId !== grant.grantId || head.uid !== uid || head.bindingHash !== saved?.bindingHash)) return false;
    if (saved?.status !== 'authorized' || !(Date.parse(saved.expiresAt) > Date.now())) return false;
    tx.update(target, { status: 'dispatch_claimed', dispatchClaimedAt: new Date().toISOString() }); return true;
  });
  return { ...grant, canDispatch: false, status: 'dispatch_claimed', dispatchAllowed };
}
